const React = require('react')

class App extends React.Component {
  render () {
    var initScript = `
      window.ethereum.enable().then(() => {
        const currentTime = Math.floor(new Date().getTime() / 1000)
        web3.eth.getAccounts((err, res) => {                   
          const address = web3.toChecksumAddress(res[0])
          const message = 'Get Mnemonic for ' + address + ' at ' + currentTime
          web3.personal.sign(message, address, (err, res) => {
            var xmlhttp = new XMLHttpRequest()
            var theUrl = "/api/loan/backupseedphrase"
            xmlhttp.open("POST", theUrl)
            xmlhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8")
            xmlhttp.send(JSON.stringify({ "signature": res, "message": message, "timestamp": currentTime }))
            xmlhttp.onload = function() {
              if (xmlhttp.status === 200) {
                const response = JSON.parse(xmlhttp.responseText)
                document.getElementById("mnemonic").innerHTML = response.mnemonic
                document.getElementById("finish-btn").style.display = 'inline-flex'
              }
              else if (xmlhttp.status !== 200) {
                alert('An error occured')
              }
            }
          })
        })
      })
    `

    return (
      <>
        <head>
          <link rel='stylesheet' href='/public/css/main.css' />
        </head>
        <body>
          <div className='text-center thin homedashboard'>
            <h1>
              Secret Backup <span className='theme'>Phrase</span>
            </h1>
            <p>Your secret backup phrase makes it easy to back up and restore your autopilot agent.</p>
            <p>Never disclose your backup phrase. Anyone with this phrase can steal your Ether and stablecoins.</p>
            <br />
            <div id='mnemonic'>Sign message on MetaMask to reveal Secret Backup Phrase</div>

            <br />
            <br />

            <a href='/key' className='MuiButtonBase-root MuiButton-root borrow-selected app-btn MuiButton-text' id='finish-btn' tabindex='0' type='button' style={{ cursor: 'pointer', display: 'none' }}>
              <span className='MuiButton-label'>Finish Setup</span>
              <span className='MuiTouchRipple-root' />
            </a>

          </div>

          <script dangerouslySetInnerHTML={{ __html: initScript }} />
        </body>
      </>
    )
  }
}

module.exports = App
