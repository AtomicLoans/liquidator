const React = require('react')

class App extends React.Component {
  render () {
    return (
      <>
        <head>
          <link rel='stylesheet' href='/public/css/main.css' />
        </head>
        <body>
          <div className='text-center thin homedashboard'>
            <h1>
              Welcome to your Autopilot <span className='theme'>Agent</span>
            </h1>
            <p>Putting your stablecoins to work on the decentralized web</p>
            <a href='/verify' className='borrow-btn'>Backup Secret Phrase</a>
          </div>
        </body>
      </>
    )
  }
}

module.exports = App
