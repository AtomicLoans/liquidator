const React = require('react')

class App extends React.Component {
  render () {
    var initScript = `
      const erc20ABI = [
        {
          "constant": true,
          "inputs": [
              {
                  "name": "_owner",
                  "type": "address"
              }
          ],
          "name": "balanceOf",
          "outputs": [
              {
                  "name": "balance",
                  "type": "uint256"
              }
          ],
          "payable": false,
          "stateMutability": "view",
          "type": "function"
        }
      ]

      window.ethereum.enable().then(() => {
        const currentTime = Math.floor(new Date().getTime() / 1000)

        var xmlhttp = new XMLHttpRequest()
        var theUrl = "/api/loan/agentinfo/ticker/USDC/BTC"
        xmlhttp.open("GET", theUrl)
        xmlhttp.send()
        xmlhttp.onload = function() {
          if (xmlhttp.status === 200) {
            const response = JSON.parse(xmlhttp.responseText)
            const liquidatorAddress = response.principalAddress
            const liquidatorCollateralAddress = response.collateralAddress
            console.log('liquidatorAddress', liquidatorAddress)

            document.getElementById("liquidator-address").innerHTML = liquidatorAddress
            document.getElementById("liquidator-btc-receive-address").innerHTML = liquidatorCollateralAddress

            web3.eth.getAccounts((err, res) => {                   
              const address = web3.toChecksumAddress(res[0])
              const message = 'Get Mnemonic for ' + address + ' at ' + currentTime
              console.log('address', address)

              var xmlhttp = new XMLHttpRequest()
              var theUrl = "/api/loan/network"
              xmlhttp.open("GET", theUrl)
              xmlhttp.send()
              xmlhttp.onload = function() {
                if (xmlhttp.status === 200) {
                  const response = JSON.parse(xmlhttp.responseText)
                  const daiContractAddress = response.DAI
                  const usdcContractAddress = response.USDC

                  web3.eth.getBalance(liquidatorAddress, function(err, ethBalance) {
                    console.log('ethBalance', web3.fromWei(ethBalance).toFixed(4))
                    document.getElementById("eth-amount").innerHTML = web3.fromWei(ethBalance).toFixed(4)
    
                    const daiERC20 = web3.eth.contract(erc20ABI).at(daiContractAddress)

                    var xmlhttp = new XMLHttpRequest()
                    var theUrl = "/api/loan/version"
                    xmlhttp.open("GET", theUrl)
                    xmlhttp.send()
                    xmlhttp.onload = function() {
                      if (xmlhttp.status === 200) {
                        const response = JSON.parse(xmlhttp.responseText)
                        const version = response.version

                        var xmlhttpTwo = new XMLHttpRequest()
                        var ghReleaseUrl = "https://api.github.com/repos/AtomicLoans/liquidator/releases/latest"
                        xmlhttpTwo.open("GET", ghReleaseUrl)
                        xmlhttpTwo.send()
                        xmlhttpTwo.onload = function() {
                          if (xmlhttpTwo.status === 200) {
                            const responseTwo = JSON.parse(xmlhttpTwo.responseText)
                            const ghVersion = responseTwo.name.replace('v', '')

                            console.log('version', version)
                            console.log('ghVersion', ghVersion)

                            console.log(version === ghVersion)

                            document.getElementById("liquidator-version").innerHTML = "Version " + version

                            if (version !== ghVersion) {
                              document.getElementById("liquidator-update").innerHTML = "Update to Version " + ghVersion
                            }

                            document.getElementById('liquidator-update').onclick = function() {
                              const currentTime = Math.floor(new Date().getTime() / 1000)

                              const message = 'Update Autopilot Agent at ' + currentTime
                              web3.personal.sign(message, address, (err, res) => {
                                var xmlhttp = new XMLHttpRequest()
                                var theUrl = "/api/loan/update"
                                xmlhttp.open("POST", theUrl)
                                xmlhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8")
                                xmlhttp.send(JSON.stringify({ "signature": res, "message": message, "timestamp": currentTime }))
                                xmlhttp.onload = function() {
                                  if (xmlhttp.status === 200) {
                                    const response = JSON.parse(xmlhttp.responseText)
                                    console.log('response', response)

                                    if (response.message === 'Success') {
                                      document.getElementById('liquidator-status').innerHTML = "Updating... (refresh in 2 min)"
                                    } else {
                                      alert('An error occured')
                                    }
                                  } else if (xmlhttp.status !== 200) {
                                    alert('An error occured')
                                  }
                                }
                              })
                            }

                            daiERC20.balanceOf(liquidatorAddress, function(err, daiBalance) {
                              console.log('dai balance', web3.fromWei(daiBalance).toFixed(4))
                              document.getElementById("dai-amount").innerHTML = web3.fromWei(daiBalance).toFixed(4)

                              const usdcERC20 = web3.eth.contract(erc20ABI).at(usdcContractAddress)

                              usdcERC20.balanceOf(liquidatorAddress, function(err, usdcBalance) {
                                console.log('usdc balance', web3.fromWei(usdcBalance, 'mwei').toFixed(4))
                                document.getElementById("usdc-amount").innerHTML = web3.fromWei(usdcBalance, 'mwei').toFixed(4)

                                var xmlhttp = new XMLHttpRequest()
                                var theUrl = "/api/loan/agentinfo/balance/btc"
                                xmlhttp.open("GET", theUrl)
                                xmlhttp.send()
                                xmlhttp.onload = function() {
                                  if (xmlhttp.status === 200) {
                                    const response = JSON.parse(xmlhttp.responseText)
                                    const btcBalance = response.btcBalance
                                    console.log('btcBalance', btcBalance)

                                    document.getElementById("btc-amount").innerHTML = btcBalance

                                    // BTC Start

                                    document.getElementById('submit-btc').onclick = function() {
                                      var btcWithdrawAddress = document.getElementById("btc-address").value;
                                      console.log(btcWithdrawAddress)

                                      const currentTime = Math.floor(new Date().getTime() / 1000)
                                      const currency = 'BTC'

                                      const amount = document.getElementById('btc-withdraw-amount').value

                                      const address = web3.toChecksumAddress(res[0])
                                      const message = 'Withdraw ' + amount + ' ' + currency + ' to ' + btcWithdrawAddress + ' at ' + currentTime
                                      web3.personal.sign(message, address, (err, res) => {
                                        var xmlhttp = new XMLHttpRequest()
                                        var theUrl = "/api/loan/withdraw"
                                        xmlhttp.open("POST", theUrl)
                                        xmlhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8")
                                        xmlhttp.send(JSON.stringify({ "signature": res, "message": message, "timestamp": currentTime, "currency": "BTC", "amount": amount, "withdrawAddress": btcWithdrawAddress }))
                                        xmlhttp.onload = function() {
                                          if (xmlhttp.status === 200) {
                                            const response = JSON.parse(xmlhttp.responseText)
                                            console.log('response', response)
                                            document.getElementById('btc-withdraw-hash').innerHTML = '<a href="https://blockstream.info/tx/' + response.withdrawHash + '">https://blockstream.info/tx/' + response.withdrawHash + '</a>'
                                          } else if (xmlhttp.status !== 200) {
                                            alert('An error occured')
                                          }
                                        }
                                      })
                                    }

                                    document.getElementById('btc-use-max').onclick = function() {
                                      document.getElementById('btc-withdraw-amount').value = parseFloat(btcBalance) - 0.005
                                    }

                                    // BTC Stop

                                    // ETH Start

                                    document.getElementById('submit-eth').onclick = function() {
                                      const currentTime = Math.floor(new Date().getTime() / 1000)
                                      const currency = 'ETH'

                                      const amount = document.getElementById('eth-withdraw-amount').value

                                      const address = web3.toChecksumAddress(res[0])
                                      const message = 'Withdraw ' + amount + ' ' + currency + ' to ' + address + ' at ' + currentTime
                                      web3.personal.sign(message, address, (err, res) => {
                                        var xmlhttp = new XMLHttpRequest()
                                        var theUrl = "/api/loan/withdraw"
                                        xmlhttp.open("POST", theUrl)
                                        xmlhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8")
                                        xmlhttp.send(JSON.stringify({ "signature": res, "message": message, "timestamp": currentTime, "currency": "ETH", "amount": amount }))
                                        xmlhttp.onload = function() {
                                          if (xmlhttp.status === 200) {
                                            const response = JSON.parse(xmlhttp.responseText)
                                            console.log('response', response)
                                            document.getElementById('eth-withdraw-hash').innerHTML = '<a href="https://etherscan.io/address/' + liquidatorAddress + '" target="_blank">https://etherscan.io/address/' + liquidatorAddress + '</a>'
                                          } else if (xmlhttp.status !== 200) {
                                            alert('An error occured')
                                          }
                                        }
                                      })
                                    }

                                    document.getElementById('eth-use-max').onclick = function() {
                                      document.getElementById('eth-withdraw-amount').value = parseFloat(web3.fromWei(ethBalance)) - 0.0005
                                    }

                                    // ETH Stop

                                    // DAI Start

                                    document.getElementById('submit-dai').onclick = function() {
                                      const currentTime = Math.floor(new Date().getTime() / 1000)
                                      const currency = 'DAI'

                                      const amount = document.getElementById('dai-withdraw-amount').value

                                      const address = web3.toChecksumAddress(res[0])
                                      const message = 'Withdraw ' + amount + ' ' + currency + ' to ' + address + ' at ' + currentTime
                                      web3.personal.sign(message, address, (err, res) => {
                                        var xmlhttp = new XMLHttpRequest()
                                        var theUrl = "/api/loan/withdraw"
                                        xmlhttp.open("POST", theUrl)
                                        xmlhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8")
                                        xmlhttp.send(JSON.stringify({ "signature": res, "message": message, "timestamp": currentTime, "currency": "DAI", "amount": amount }))
                                        xmlhttp.onload = function() {
                                          if (xmlhttp.status === 200) {
                                            const response = JSON.parse(xmlhttp.responseText)
                                            console.log('response', response)
                                            document.getElementById('dai-withdraw-hash').innerHTML = '<a href="https://etherscan.io/address/' + liquidatorAddress + '" target="_blank">https://etherscan.io/address/' + liquidatorAddress + '</a>'
                                          } else if (xmlhttp.status !== 200) {
                                            alert('An error occured')
                                          }
                                        }
                                      })
                                    }

                                    document.getElementById('dai-use-max').onclick = function() {
                                      document.getElementById('dai-withdraw-amount').value = parseFloat(web3.fromWei(daiBalance))
                                    }

                                    // DAI End

                                    // USDC Start

                                    document.getElementById('submit-usdc').onclick = function() {
                                      const currentTime = Math.floor(new Date().getTime() / 1000)
                                      const currency = 'USDC'

                                      const amount = document.getElementById('usdc-withdraw-amount').value

                                      const address = web3.toChecksumAddress(res[0])
                                      const message = 'Withdraw ' + amount + ' ' + currency + ' to ' + address + ' at ' + currentTime
                                      web3.personal.sign(message, address, (err, res) => {
                                        var xmlhttp = new XMLHttpRequest()
                                        var theUrl = "/api/loan/withdraw"
                                        xmlhttp.open("POST", theUrl)
                                        xmlhttp.setRequestHeader("Content-Type", "application/json;charset=UTF-8")
                                        xmlhttp.send(JSON.stringify({ "signature": res, "message": message, "timestamp": currentTime, "currency": "USDC", "amount": amount }))
                                        xmlhttp.onload = function() {
                                          if (xmlhttp.status === 200) {
                                            const response = JSON.parse(xmlhttp.responseText)
                                            console.log('response', response)
                                            document.getElementById('usdc-withdraw-hash').innerHTML = '<a href="https://etherscan.io/address/' + liquidatorAddress + '" target="_blank">https://etherscan.io/address/' + liquidatorAddress + '</a>'
                                          } else if (xmlhttp.status !== 200) {
                                            alert('An error occured')
                                          }
                                        }
                                      })
                                    }
                                    document.getElementById('usdc-use-max').onclick = function() {
                                      document.getElementById('usdc-withdraw-amount').value = parseFloat(web3.fromWei(usdcBalance, 'mwei'))
                                    }

                                    // USDC End
                                  }
                                  else if (xmlhttp.status !== 200) {
                                    alert('An error occured')
                                  }
                                }
                              })
                            })
                          } else if (xmlhttp.status !== 200) {
                            alert('An error occured')
                          }
                        }
                      } else if (xmlhttp.status !== 200) {
                        alert('An error occured')
                      }
                    }
                  })
                } else if (xmlhttp.status !== 200) {
                  alert('An error occured')
                }
              }
            })
          }
          else if (xmlhttp.status !== 200) {
            alert('An error occured')
          }
        }
      })
    `

    return (
      <>
        <head>
          <link rel='stylesheet' href='/public/css/main.css' />
        </head>
        <body>
          <div className='text-center thin homedashboard'>
            <h1>Dashboard</h1>

            <p id='liquidator-version'>Version 0.1.0</p>
            <p id='liquidator-update' style={{ cursor: 'pointer', textDecoration: 'underline', color: '#e29ffd', fontWeight: 600 }}> </p>
            <p id='liquidator-status'> </p>

            <br />
            <br />

            <h2>Ethereum</h2>

            <p id='liquidator-address'>0x</p>
            <table className='MuiTable-root' style={{ margin: '10px auto' }}>
              <thead className='MuiTableHead-root'>
                <tr className='MuiTableRow-root jss162 MuiTableRow-head jss163'>
                  <th className='MuiTableCell-root MuiTableCell-head jss169' scope='col'>Asset</th>
                  <th className='MuiTableCell-root MuiTableCell-head jss169 MuiTableCell-alignCenter' scope='col'>Balance</th>
                </tr>
              </thead>
              <tbody className='MuiTableBody-root'>
                <tr className='MuiTableRow-root jss162'>
                  <th className='MuiTableCell-root MuiTableCell-body jss170' scope='row'>USDC</th>
                  <td className='MuiTableCell-root MuiTableCell-body jss170 MuiTableCell-alignCenter' id='usdc-amount'>0.00</td>
                </tr>
                <tr className='MuiTableRow-root jss162'>
                  <th className='MuiTableCell-root MuiTableCell-body jss170' scope='row'>DAI</th>
                  <td className='MuiTableCell-root MuiTableCell-body jss170 MuiTableCell-alignCenter' id='dai-amount'>0.00</td>
                </tr>
                <tr className='MuiTableRow-root jss162'>
                  <th className='MuiTableCell-root MuiTableCell-body jss170' scope='row'>ETH</th>
                  <td className='MuiTableCell-root MuiTableCell-body jss170 MuiTableCell-alignCenter' id='eth-amount'>0.00</td>
                </tr>
              </tbody>
            </table>

            <br />

            <p>Withdraw USDC</p>
            <div className='field'>
              <button id='usdc-use-max'>Use Max</button>
              <input placeholder='100' label='USDC Amount' value='' id='usdc-withdraw-amount' />
              <div className='field_aside click theme1' id='submit-usdc'>Withdraw</div>
            </div>
            <p id='usdc-withdraw-hash' />

            <p>Withdraw DAI</p>
            <div className='field'>
              <button id='dai-use-max'>Use Max</button>
              <input placeholder='100' label='DAI Amount' value='' id='dai-withdraw-amount' />
              <div className='field_aside click theme1' id='submit-dai'>Withdraw</div>
            </div>
            <p id='dai-withdraw-hash' />

            <p>Withdraw ETH</p>
            <div className='field'>
              <button id='eth-use-max'>Use Max</button>
              <input placeholder='2.3' label='2.3' value='' id='eth-withdraw-amount' />
              <div className='field_aside click theme1' id='submit-eth'>Withdraw</div>
            </div>
            <p id='eth-withdraw-hash' />

            <br />
            <br />

            <h2>Bitcoin</h2>

            <p id='liquidator-btc-receive-address' />
            <table className='MuiTable-root' style={{ margin: '10px auto' }}>
              <thead className='MuiTableHead-root'>
                <tr className='MuiTableRow-root jss162 MuiTableRow-head jss163'>
                  <th className='MuiTableCell-root MuiTableCell-head jss169' scope='col'>Asset</th>
                  <th className='MuiTableCell-root MuiTableCell-head jss169 MuiTableCell-alignCenter' scope='col'>Balance</th>
                </tr>
              </thead>
              <tbody className='MuiTableBody-root'>
                <tr className='MuiTableRow-root jss162'>
                  <th className='MuiTableCell-root MuiTableCell-body jss170' scope='row'>BTC</th>
                  <td className='MuiTableCell-root MuiTableCell-body jss170 MuiTableCell-alignCenter' id='btc-amount'>0.00</td>
                </tr>
              </tbody>
            </table>

            <br />

            <p>Withdraw BTC</p>
            <div className='field'>
              <input placeholder='bc1qr7tgxt4lexl0ys5q27euz0qatsp09wzva7aycm' label='BTC Address' value='' id='btc-address' className='left' />
            </div>
            <div className='field'>
              <button id='btc-use-max'>Use Max</button>
              <input placeholder='0.88' label='0.88' value='' id='btc-withdraw-amount' />
              <div className='field_aside click theme1' id='submit-btc'>Withdraw</div>
            </div>
            <p id='btc-withdraw-hash' />

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
