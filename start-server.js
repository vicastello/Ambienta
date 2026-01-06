const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.builds', 'config', '.env') });

require('./server.js');
