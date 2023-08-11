import { router as accountsRouter } from './api/accounts.js';
import { router as transactionsRouter } from './api/transactions.js';
// const validateAuth = require('../middlewares/validateAuth');
// const getData = require('../middlewares/getData');

export default function routes(app) {
	app.use('/accounts', accountsRouter);
	app.use('/transactions', transactionsRouter);
	// app.use('/users', validateAuth.checkIfAuthenticated, getData.getGeoip, users);
	app.use('*', (req, res) => {
		res.send('Not found!!!');
	});
}
