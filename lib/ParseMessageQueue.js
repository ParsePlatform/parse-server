"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseMessageQueue = void 0;

var _AdapterLoader = require("./Adapters/AdapterLoader");

var _EventEmitterMQ = require("./Adapters/MessageQueue/EventEmitterMQ");

const ParseMessageQueue = {};
exports.ParseMessageQueue = ParseMessageQueue;

ParseMessageQueue.createPublisher = function (config) {
  const adapter = (0, _AdapterLoader.loadAdapter)(config.messageQueueAdapter, _EventEmitterMQ.EventEmitterMQ, config);

  if (typeof adapter.createPublisher !== 'function') {
    throw 'pubSubAdapter should have createPublisher()';
  }

  return adapter.createPublisher(config);
};

ParseMessageQueue.createSubscriber = function (config) {
  const adapter = (0, _AdapterLoader.loadAdapter)(config.messageQueueAdapter, _EventEmitterMQ.EventEmitterMQ, config);

  if (typeof adapter.createSubscriber !== 'function') {
    throw 'messageQueueAdapter should have createSubscriber()';
  }

  return adapter.createSubscriber(config);
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZU1lc3NhZ2VRdWV1ZS5qcyJdLCJuYW1lcyI6WyJQYXJzZU1lc3NhZ2VRdWV1ZSIsImNyZWF0ZVB1Ymxpc2hlciIsImNvbmZpZyIsImFkYXB0ZXIiLCJtZXNzYWdlUXVldWVBZGFwdGVyIiwiRXZlbnRFbWl0dGVyTVEiLCJjcmVhdGVTdWJzY3JpYmVyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBRUEsTUFBTUEsaUJBQWlCLEdBQUcsRUFBMUI7OztBQUVBQSxpQkFBaUIsQ0FBQ0MsZUFBbEIsR0FBb0MsVUFBVUMsTUFBVixFQUE0QjtBQUM5RCxRQUFNQyxPQUFPLEdBQUcsZ0NBQVlELE1BQU0sQ0FBQ0UsbUJBQW5CLEVBQXdDQyw4QkFBeEMsRUFBd0RILE1BQXhELENBQWhCOztBQUNBLE1BQUksT0FBT0MsT0FBTyxDQUFDRixlQUFmLEtBQW1DLFVBQXZDLEVBQW1EO0FBQ2pELFVBQU0sNkNBQU47QUFDRDs7QUFDRCxTQUFPRSxPQUFPLENBQUNGLGVBQVIsQ0FBd0JDLE1BQXhCLENBQVA7QUFDRCxDQU5EOztBQVFBRixpQkFBaUIsQ0FBQ00sZ0JBQWxCLEdBQXFDLFVBQVVKLE1BQVYsRUFBNkI7QUFDaEUsUUFBTUMsT0FBTyxHQUFHLGdDQUFZRCxNQUFNLENBQUNFLG1CQUFuQixFQUF3Q0MsOEJBQXhDLEVBQXdESCxNQUF4RCxDQUFoQjs7QUFDQSxNQUFJLE9BQU9DLE9BQU8sQ0FBQ0csZ0JBQWYsS0FBb0MsVUFBeEMsRUFBb0Q7QUFDbEQsVUFBTSxvREFBTjtBQUNEOztBQUNELFNBQU9ILE9BQU8sQ0FBQ0csZ0JBQVIsQ0FBeUJKLE1BQXpCLENBQVA7QUFDRCxDQU5EIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbG9hZEFkYXB0ZXIgfSBmcm9tICcuL0FkYXB0ZXJzL0FkYXB0ZXJMb2FkZXInO1xuaW1wb3J0IHsgRXZlbnRFbWl0dGVyTVEgfSBmcm9tICcuL0FkYXB0ZXJzL01lc3NhZ2VRdWV1ZS9FdmVudEVtaXR0ZXJNUSc7XG5cbmNvbnN0IFBhcnNlTWVzc2FnZVF1ZXVlID0ge307XG5cblBhcnNlTWVzc2FnZVF1ZXVlLmNyZWF0ZVB1Ymxpc2hlciA9IGZ1bmN0aW9uIChjb25maWc6IGFueSk6IGFueSB7XG4gIGNvbnN0IGFkYXB0ZXIgPSBsb2FkQWRhcHRlcihjb25maWcubWVzc2FnZVF1ZXVlQWRhcHRlciwgRXZlbnRFbWl0dGVyTVEsIGNvbmZpZyk7XG4gIGlmICh0eXBlb2YgYWRhcHRlci5jcmVhdGVQdWJsaXNoZXIgIT09ICdmdW5jdGlvbicpIHtcbiAgICB0aHJvdyAncHViU3ViQWRhcHRlciBzaG91bGQgaGF2ZSBjcmVhdGVQdWJsaXNoZXIoKSc7XG4gIH1cbiAgcmV0dXJuIGFkYXB0ZXIuY3JlYXRlUHVibGlzaGVyKGNvbmZpZyk7XG59O1xuXG5QYXJzZU1lc3NhZ2VRdWV1ZS5jcmVhdGVTdWJzY3JpYmVyID0gZnVuY3Rpb24gKGNvbmZpZzogYW55KTogdm9pZCB7XG4gIGNvbnN0IGFkYXB0ZXIgPSBsb2FkQWRhcHRlcihjb25maWcubWVzc2FnZVF1ZXVlQWRhcHRlciwgRXZlbnRFbWl0dGVyTVEsIGNvbmZpZyk7XG4gIGlmICh0eXBlb2YgYWRhcHRlci5jcmVhdGVTdWJzY3JpYmVyICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgJ21lc3NhZ2VRdWV1ZUFkYXB0ZXIgc2hvdWxkIGhhdmUgY3JlYXRlU3Vic2NyaWJlcigpJztcbiAgfVxuICByZXR1cm4gYWRhcHRlci5jcmVhdGVTdWJzY3JpYmVyKGNvbmZpZyk7XG59O1xuXG5leHBvcnQgeyBQYXJzZU1lc3NhZ2VRdWV1ZSB9O1xuIl19