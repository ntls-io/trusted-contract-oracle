import express from 'express';

import { record, getTransaction } from '../../src/controllers/transactions.js';
import { validate } from '../../middlewares/validateSchemas.js';
import schemas from '../schemas/transactions.js';

export const router = express.Router();

router.post('/record', validate(schemas.record, 'body'), (req, res) => {
	record(res, req.body);
});

router.get('/:hash', (req, res) => {
	getTransaction(res, req.params);
});
