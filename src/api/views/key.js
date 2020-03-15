const React = require('react')

class App extends React.Component {
  render () {
    var initScript = `
      document.getElementById('submit').onclick = function() {
        var apiKey = document.getElementById("apikey").value;
        console.log(apiKey)

        window.ethereum.enable().then(() => {
          const currentTime = Math.floor(new Date().getTime() / 1000)
          web3.eth.getAccounts((err, res) => {                   
            const address = web3.toChecksumAddress(res[0])
            const message = 'Set Heroku API Key ' + apiKey + ' at ' + currentTime
            web3.personal.sign(message, address, (err, res) => {
              var xmlhttp = new XMLHttpRequest()
              var theUrl = "/api/loan/set_heroku_api_key"
              xmlhttp.open("POST", theUrl)
              xmlhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8")
              xmlhttp.send(JSON.stringify({ "signature": res, "message": message, "timestamp": currentTime, key: apiKey }))
              xmlhttp.onload = function() {
                if (xmlhttp.status === 200) {
                  const response = JSON.parse(xmlhttp.responseText)
                  console.log('response', response)
                  window.open('/dashboard', '_self')
                } else if (xmlhttp.status !== 200) {
                  alert('An error occured')
                }
              }
            })
          })
        })
      }
    `

    return (
      <>
        <head>
          <link rel='stylesheet' href='/public/css/main.css' />
        </head>
        <body>
          <div className='text-center thin homedashboard'>

            <h1>
              Enter Heroku API <span className='theme'>Key</span>
            </h1>
            <p>To find your Heroku API Key, go to <a href='https://dashboard.heroku.com/account' target='_blank' rel='noopener noreferrer'>https://dashboard.heroku.com/account</a></p>
            <p>This will allow you to update your autopilot agent by authenticating using your metamask account.</p>
            <br />
            <div className='field'>
              <input placeholder='Heroku API Key' label='Heroku API Key' value='' id='apikey' />
              <div className='field_aside click theme1' id='submit'>Submit</div>
            </div>

          </div>

          <script dangerouslySetInnerHTML={{ __html: initScript }} />
        </body>
      </>
    )
  }
}

module.exports = App
