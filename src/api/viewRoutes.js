exports.index = function (req, res) {
  res.render('index')
}

exports.verify = function (req, res) {
  res.render('verify')
}

exports.key = function (req, res) {
  res.render('key')
}

exports.success = function (req, res) {
  res.render('success')
}

exports.dashboard = function (req, res) {
  res.render('dashboard')
}
