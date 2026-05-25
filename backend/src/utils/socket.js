let _io = null;

/**
 * Initialize the Socket.io instance
 * @param {import('socket.io').Server} io
 */
function initSocket(io) {
  _io = io;
}

/**
 * Get the Socket.io instance
 * @returns {import('socket.io').Server | null}
 */
function getIO() {
  return _io;
}

/**
 * Emit an event to all admin users
 * @param {string} event - Event name
 * @param {any} data - Data to emit
 */
function emitToAdmins(event, data) {
  if (_io) {
    _io.to('admins').emit(event, data);
  }
}

/**
 * Emit an event to a specific user
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {any} data - Data to emit
 */
function emitToUser(userId, event, data) {
  if (_io) {
    _io.to(`user:${userId}`).emit(event, data);
  }
}

module.exports = { initSocket, getIO, emitToAdmins, emitToUser };
