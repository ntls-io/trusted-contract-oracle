import app from './app.js';
import config from './config.js';

const PORT = process.env.PORT || config.PORT;

const server = app.listen(PORT, () => {
	console.log('server is running on port', server.address().port);
});
