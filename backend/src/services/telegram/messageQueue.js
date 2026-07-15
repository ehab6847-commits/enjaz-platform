'use strict';

const logger = require('../../config/logger');

class MessageQueue {
  /**
   * Creates a queue processor.
   * @param {Function} processor - The async function to process each message
   * @param {number} concurrency - Max concurrent processing tasks
   */
  constructor(processor, concurrency = 2) {
    this.queue = [];
    this.processor = processor;
    this.concurrency = concurrency;
    this.activeCount = 0;
    this.totalProcessed = 0;
    this.totalFailed = 0;
  }

  /**
   * Adds an item to the queue.
   * @param {Object} event - The Telegram message event
   * @param {Object} account - The DB account
   * @param {Object} client - The active TelegramClient
   */
  enqueue(event, account, client) {
    this.queue.push({ event, account, client });
    logger.debug(`Queue size: ${this.queue.length} (active: ${this.activeCount})`);
    this.processNext();
  }

  /**
   * Triggers processing of the next queue items.
   */
  async processNext() {
    if (this.activeCount >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.activeCount++;
    const { event, account, client } = this.queue.shift();

    try {
      await this.processor(event, account, client);
      this.totalProcessed++;
    } catch (err) {
      this.totalFailed++;
      logger.error('Queue processing task failed', {
        error: err.message,
        stack: err.stack,
        account: account.phone,
      });
    } finally {
      this.activeCount--;
      // Schedule next item
      setImmediate(() => this.processNext());
    }
  }

  /**
   * Returns queue performance statistics.
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      activeCount: this.activeCount,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
    };
  }
}

module.exports = MessageQueue;
