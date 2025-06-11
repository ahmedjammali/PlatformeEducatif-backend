const bcrypt = require('bcryptjs');

const hashPassword = async () => {
  const password = 'ahmed2002'; // replace with your desired password
  const hashed = await bcrypt.hash(password, 10);
  console.log('Hashed password:', hashed);
};

hashPassword();



