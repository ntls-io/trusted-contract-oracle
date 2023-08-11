import express from 'express';
import { createEscrowAccount } from '../../src/controllers/accounts.js';
import { getAccountTransactions } from '../../services/ledger/accounts.js';

export const router = express.Router();

router.post('/', (req, res) => {
	createEscrowAccount(res);
});

router.get('/transactions', (req, res) => {
	getAccountTransactions(res);
});
