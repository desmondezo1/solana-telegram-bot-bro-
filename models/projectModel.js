const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  datetime: Date,
  type: String,
  taxRatio: String,
  link: String,
  chain: String,
  website: String,
}, { collection: 'projects' }); 

module.exports = mongoose.model('Project', projectSchema);