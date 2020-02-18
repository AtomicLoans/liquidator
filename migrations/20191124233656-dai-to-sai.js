module.exports = {
  async up (db, client) {
    await db.collection('agentfunds').updateMany({ principal: 'DAI' }, { $set: { principal: 'SAI' } })
    await db.collection('approves').updateMany({ principal: 'DAI' }, { $set: { principal: 'SAI' } })
    await db.collection('funds').updateMany({ principal: 'DAI' }, { $set: { principal: 'SAI' } })
    await db.collection('loans').updateMany({ principal: 'DAI' }, { $set: { principal: 'SAI' } })
    await db.collection('loanmarkets').updateMany({ principal: 'DAI' }, { $set: { principal: 'SAI' } })
    await db.collection('markets').updateMany({ to: 'DAI' }, { $set: { to: 'SAI' } })
    await db.collection('sales').updateMany({ principal: 'DAI' }, { $set: { principal: 'SAI' } })
    await db.collection('secrets').updateMany({ principal: 'DAI' }, { $set: { principal: 'SAI', oldPrincipal: 'DAI' } })
  },

  async down (db, client) {
    await db.collection('agentfunds').updateMany({ principal: 'SAI' }, { $set: { principal: 'DAI' } })
    await db.collection('approves').updateMany({ principal: 'SAI' }, { $set: { principal: 'DAI' } })
    await db.collection('funds').updateMany({ principal: 'SAI' }, { $set: { principal: 'DAI' } })
    await db.collection('loans').updateMany({ principal: 'SAI' }, { $set: { principal: 'DAI' } })
    await db.collection('loanmarkets').updateMany({ principal: 'SAI' }, { $set: { principal: 'DAI' } })
    await db.collection('markets').updateMany({ to: 'SAI' }, { $set: { to: 'DAI' } })
    await db.collection('sales').updateMany({ principal: 'SAI' }, { $set: { principal: 'DAI' } })
    await db.collection('secrets').updateMany({ principal: 'SAI' }, { $set: { principal: 'DAI', oldPrincipal: '' } })
  }
}
