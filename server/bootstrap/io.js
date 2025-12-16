// io.js
'use strict';

const { SocketIO } = require('../structures');
const { pluginId } = require('../utils/pluginId');

async function bootstrapIO({ strapi }) {
  const settings = strapi.config.get(`plugin::${pluginId}`);

  if (strapi?.server?.app) {
    strapi.server.app.proxy = true;
  }

  const io = new SocketIO(strapi.server.httpServer, settings.socket.serverOptions);

  strapi.$io = io;

  if (settings.events?.length) {
    strapi.$io.server.on('connection', (socket) => {
      for (const event of settings.events) {
        if (event.name === 'connection') {
          event.handler({ strapi, io }, socket);
        } else {
          socket.on(event.name, (...args) =>
            event.handler({ strapi, io }, socket, ...args)
          );
        }
      }
    });
  }
}

module.exports = { bootstrapIO };
