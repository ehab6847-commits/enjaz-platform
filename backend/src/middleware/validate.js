'use strict';

const { ZodError } = require('zod');
const logger = require('../config/logger');

/**
 * Middleware factory that validates request data using a Zod schema.
 * Can validate body, query, params, or any combination.
 *
 * @param {Object} schemas - Object with optional keys: body, query, params
 * @param {import('zod').ZodSchema} [schemas.body] - Schema for req.body
 * @param {import('zod').ZodSchema} [schemas.query] - Schema for req.query
 * @param {import('zod').ZodSchema} [schemas.params] - Schema for req.params
 * @returns {import('express').RequestHandler}
 */
const validate = (schemas) => {
  return (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));

        logger.debug('Validation failed', { errors, url: req.originalUrl });

        return res.status(422).json({
          success: false,
          message: 'Validation failed. Please check the provided data.',
          errors,
        });
      }
      next(err);
    }
  };
};

module.exports = { validate };
