'use strict';

const logger = require('../../config/logger');

class MessageQueue {
  /**
   * Creates a queue processor.
   * @param {Function} processor - The async function to process each message
   * @param {number} defaultConcurrency - Default max concurrent processing tasks
   */
  constructor(processor, defaultConcurrency = 10) {
    this.queue = [];
    this.processor = processor;
    
    // Read from environment variable or fallback to default
    const envConcurrency = process.env.QUEUE_CONCURRENCY ? parseInt(process.env.QUEUE_CONCURRENCY, 10) : NaN;
    this.concurrency = isNaN(envConcurrency) ? defaultConcurrency : envConcurrency;
    
    this.activeCount = 0;
    this.totalProcessed = 0;
    this.totalFailed = 0;
    this.maxQueueSize = 1000; // Prevent unbounded memory growth
  }

  /**
   * Adds an item to the queue.
   * @param {Object} event - The Telegram message event
   * @param {Object} account - The DB account
   * @param {Object} client - The active TelegramClient
   */
  enqueue(event, account, client) {
    if (this.queue.length >= this.maxQueueSize) {
      logger.warn(`Queue size limit reached (${this.maxQueueSize}). Dropping message to prevent memory overflow.`, {
        account: account.phone,
        messageId: event.message?.id
      });
      return;
    }
    
    this.queue.push({ event, account, client, retries: 0 });
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
    const task = this.queue.shift();
    const { event, account, client, retries } = task;

    try {
      await this.processor(event, account, client);
      this.totalProcessed++;
    } catch (err) {
      // Simple retry logic (retry once after 1.5 seconds delay)
      if (retries < 1) {
        logger.warn(`Task failed, scheduling retry in 1.5s`, {
          error: err.message,
          account: account.phone,
          retries: retries + 1
        });
        setTimeout(() => {
          this.queue.push({ event, account, client, retries: retries + 1 });
          this.processNext();
        }, 1500);
      } else {
        this.totalFailed++;
        logger.error('Queue processing task failed permanently after retry', {
          error: err.message,
          stack: err.stack,
          account: account.phone,
        });
      }
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
