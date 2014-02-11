#!/usr/bin/env node

var WebSocketServer = require('ws').Server;
var Memory = require('./data/Memory');
var jsonPatch = require('./lib/jsonPatch');

var todos = new Memory([]);

var clientId = 1;
var clients = {};

var server = new WebSocketServer({port: 8080});

server.on('connection', function(ws) {
	var id = clientId++;
	var client = clients[id] = new ClientProxy(ws, id);
	console.log('connected', id);

	client.set(todos.get());

	ws.on('message', function(message) {
		var patch = JSON.parse(message);
		if(!patch.patch) {
			console.log('no patch info');
			return;
		}

		patch = patch.patch;

		process.nextTick(function() {
			client._shadow = jsonPatch.patch(patch, client._shadow);
			todos.patch(patch);

			var returnPatch = todos.diff(client._shadow);
			client.patch(returnPatch);

			if(patch && patch.length > 0) {
				Object.keys(clients).forEach(function(clientId) {
					if(clientId != id) {
						var c = clients[clientId];
						var returnPatch = jsonPatch.diff(c._shadow, todos._shadow);
						c.patch(returnPatch);
					}
				});
			}
		});
	});

	ws.on('close', function() {
		console.log('disconnected', id);
		delete clients[id];
	});
});

function ClientProxy(client, id) {
	this.client = client;
	this.id = id;
}

ClientProxy.prototype = {
	set: function(data) {
		this._shadow = jsonPatch.snapshot(data);
		this.client.send(JSON.stringify({ data: data }));
	},

	diff: function(data) {
		return jsonPatch.diff(data, this._shadow);
	},

	patch: function(patch) {
		if(!patch || patch.length === 0) {
			return;
		}

		try {
			this._shadow = jsonPatch.patch(patch, this._shadow);
			this.send(patch);
		} catch(e) {
			console.error(e.stack);
		}
	},

	send: function(patch) {
		this.client.send(JSON.stringify({ patch: patch }));
	}
};
