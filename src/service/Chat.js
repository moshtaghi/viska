import { minifyStr, strToNumber } from '../../utils/handy.js';
import SocketIo from 'socket.io-client';

const User = (type, xid) => {
  const name = !type ? 'unknown' : `${type.toUpperCase()}-${minifyStr(xid, 10)}`;
  const avatar = `${process.env.STATIC_URL_PREFIX || ''}/avatars/${strToNumber(name, 50)}.png`;  
  return {
    type,
    xid,
    name,
    avatar,
  }
}

const ChatService = {
  data(){
    return {
      user: User(),
      sid: undefined,
      server: undefined,
      chats: [],
    }
  },
  methods: {
    init(serverUrl) {
      this.server = SocketIo(serverUrl, {
        autoConnect: false,
      });
      this.server.on('connect', this._onConnectionStateChange.bind(this, true));
      this.server.on('disconnect', this._onConnectionStateChange.bind(this, false));
      this.server.on('newMessage', this._onNewMessage);
      this.server.on('isTypingFlag', this._onIsTypingFlag);
    },
    // will connect to server...
    login(type, data) {
      return new Promise((resolve, reject) => {
        this.server.open();
        this.$once('connect', () => {
          this.server.emit('login', {
            type,
            data,
          }, (err, xid) => {
            if (err) {
              this.server.close();
              reject();
            } else {
              this.sid = this.server.id;
              this.user = User(type, xid);
              this._loadChats();
              this.$emit('login', this.auth);
              resolve();
            }
          });
        });
      });
    },
    // will disconnect from server
    logout() {
      this.user = User();
      this._clearChats();
      this.server.close();
      this.$emit('logout');
    },
    // find random user
    addRandomChat() {
      return new Promise((resolve, reject) => {
        const ignoreList = this.chats.map((chat) => ({
          xid: chat.user.xid,
          type: chat.user.type,
        }))
        this.server.emit('findRandomUser', ignoreList, (err, user) => {
          if (err || !user) {
            reject();
          } else {
            const chat = this._upsertChat(user.type, user.xid);
            this._saveChats();
            resolve(chat);
          }
        });
      });
    },
    // send a message
    sendMessage(chat, body) {
      return new Promise((resolve, reject) => {
        this.server.emit('sendMessage', {
          user: chat.user,
          body,
        }, (err) => {
          if (err) {
            reject();
          } else {
            chat.messages.push({
              from: 'me',
              body,
            });
            this._saveChats();
            resolve();
          }
        });
      });
    },
    // send is_typing flag
    sendIsTypingFlag(chat) {
      return new Promise((resolve, reject) => {
        this.server.emit('sendIsTypingFlag', {
          user: {
            type: chat.user.type,
            xid: chat.user.xid,
          }
        }, (err) => {
          if (err) {
            reject();
          } else {
            resolve();
          }
        });
      });
    },
    // on is_typing flag
    _onIsTypingFlag(chat) {
      this.$emit('isTypingFlag', chat);
    },
    // get single chat
    getChat({ type, xid }) {
      const chat = this._upsertChat(type, xid);
      return chat;
    },
    // refresh chat status
    refreshChat(chat) {
      return new Promise((resolve, reject) => {
        this.server.emit('getUserStatus', chat.user, (err, status) => {
          if (err) {
            reject();
          } else {
            chat.isOnline = status;
            resolve(status);
          }
        });
      });
    },

    _onNewMessage({user: { type, xid }, body}) {
      const chat = this._upsertChat(type, xid);
      chat.isOnline = true;
      chat.messages.push({
        from: 'its',
        body,
      });
      this._saveChats();
      this.$emit('newMessage', {
        user: User(type, xid),
        body,
      });
    },
    // save current chats in localStorage
    _saveChats() {
      const chats = this.chats.map((chat) => {
        return {
          ...chat,
          isOnline: null
        }
      })
      localStorage.setItem(`${JSON.stringify(this.user)}:chats`, JSON.stringify(chats));
    },
    // load current user chats from localStorage
    _loadChats() {
      const cachedChats = localStorage.getItem(`${JSON.stringify(this.user)}:chats`);
      if (cachedChats) {
        this.chats = JSON.parse(cachedChats);
      }
    },
    // delete current user chats
    _clearChats() {
      localStorage.removeItem(`${JSON.stringify(this.user)}:chats`);
      this.chats = [];
    },
    _onConnectionStateChange(newState) {
      if (newState === true) {
        this.sid = this.server.id;
        this.$emit('connect', this.sid);
      } else {
        this.sid = undefined;
        this.$emit('disconnect');
      }
    },
    _upsertChat(type, xid) {
      let chat = this.chats.find((chat) => chat.user.type === type && chat.user.xid === xid);
      if (!chat) {
        chat = {
          user: User(type, xid),
          isOnline: null,
          messages: [],
        };
        this.chats.unshift(chat);
      }
      return chat;
    },
  },
}




export default ChatService;