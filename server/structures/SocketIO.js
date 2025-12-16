'use strict';

const { Server } = require('socket.io');
const { handshake } = require('../middleware');
const { getService } = require('../utils/getService');
const { pluginId } = require('../utils/pluginId');
const { API_TOKEN_TYPE } = require('../utils/constants');

class SocketIO {
  constructor({ strapi, options }) {
    // 🔥 clave: asegurarte que Koa confía en headers del proxy
    if (strapi?.server?.app) {
      strapi.server.app.proxy = true;
    }

    this._strapi = strapi;
    this._socket = new Server(strapi.server.httpServer, options);

    const { hooks } = strapi.config.get(`plugin::${pluginId}`);
    hooks.init?.({ strapi, $io: this });

    this._socket.use(handshake);
  }

  async emit({ event, schema, data: rawData }) {
    const strapi = this._strapi;
    const sanitizeService = getService({ name: 'sanitize' });
    const strategyService = getService({ name: 'strategy' });
    const transformService = getService({ name: 'transform' });

    if (!rawData) return;

    const eventName = `${schema.singularName}:${event}`;

    for (const strategyType in strategyService) {
      const strategy = strategyService[strategyType];
      const rooms = await strategy.getRooms();

      for (const room of rooms) {
        const permissions = room.permissions.map(({ action }) => ({ action }));
        const ability = await strapi.contentAPI.permissions.engine.generateAbility(permissions);

        if (room.type === API_TOKEN_TYPE.FULL_ACCESS || ability.can(schema.uid + '.' + event)) {
          const sanitizedData = await sanitizeService.output({
            data: rawData,
            schema,
            options: {
              auth: {
                name: strategy.name,
                ability,
                strategy: { verify: strategy.verify },
                credentials: strategy.credentials?.(room),
              },
            },
          });

          const roomName = strategy.getRoomName(room);
          const data = transformService.response({ data: sanitizedData, schema });

          this._socket.to(roomName.replace(' ', '-')).emit(eventName, { ...data });
        }
      }
    }
  }

  async raw({ event, data, rooms }) {
    let emitter = this._socket;
    if (rooms?.length) rooms.forEach((r) => (emitter = emitter.to(r)));
    emitter.emit(event, { data });
  }

  get server() {
    return this._socket;
  }
}

module.exports = { SocketIO };