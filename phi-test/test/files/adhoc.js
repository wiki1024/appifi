const Promise = require('bluebird')
const path = require('path')
const fs = Promise.promisifyAll(require('fs'))
const mkdirp = require('mkdirp')
const mkdirpAsync = Promise.promisify(mkdirp)
const rimraf = require('rimraf')
const rimrafAsync = Promise.promisify(rimraf)
const { isUUID } = require('validator')

const request = require('supertest')

const chai = require('chai').use(require('chai-as-promised'))
const expect = chai.expect

const FILES = require('../lib').FILES
const { alonzo, hello, pdf } = FILES

const Fruitmix = require('src/fruitmix/Fruitmix')
const App = require('src/app/App')
const Watson = require('phi-test/lib/watson')

const cwd = process.cwd()
const tmptest = path.join(cwd, 'tmptest')
const fruitmixDir = path.join(tmptest, 'fruitmix')
// node src/utils/md4Encrypt.js alice

const alice = {
  uuid: 'cb33b5b3-dd58-470f-8ccc-92aa04d75590',
  username: 'alice',
  password: '$2a$10$nUmDoy9SDdkPlj9yuYf2HulnbtvbF0Ei6rGF1G1UKUkJcldINaJVy',
  smbPassword: '4039730E1BF6E10DD01EAAC983DB4D7C',
  lastChangeTime: 1523867673407,
  isFirstUser: true,
  createTime: 1523867673407,
  status: 'ACTIVE',
  phicommUserId: 'alice'
}

describe(path.basename(__filename), () => {
  const requestToken = (express, userUUID, password, callback) =>
    request(express)
      .get('/token')
      .auth(userUUID, password)
      .expect(200)
      .end((err, res) => err ? callback(err) : callback(null, res.body.token))

  const requestTokenAsync = Promise.promisify(requestToken)

  const requestHome = (express, userUUID, token, callback) =>
    request(express)
      .get('/drives')
      .set('Authorization', 'JWT ' + token)
      .expect(200)
      .end((err, res) => {
        if (err) return callback(err)
        let home = res.body.find(d => d.type === 'private' && d.owner === userUUID)
        if (!home) {
          callback(new Error('home drive not found'))
        } else {
          callback(null, home)
        }
      })

  const requestHomeAsync = Promise.promisify(requestHome)

  describe('alonzo', () => {
    let fruitmix, app, token, home

    beforeEach(async () => {
      await Promise.delay(100)
      await rimrafAsync(tmptest)
      await mkdirpAsync(fruitmixDir)

      let userFile = path.join(fruitmixDir, 'users.json')
      await fs.writeFileAsync(userFile, JSON.stringify([alice], null, '  '))

      fruitmix = new Fruitmix({ fruitmixDir })
      app = new App({ fruitmix, log: { skip: 'all', error: 'none' } })
      await new Promise(resolve => fruitmix.once('FruitmixStarted', () => resolve()))
      token = await requestTokenAsync(app.express, alice.uuid, 'alice')
      home = await requestHomeAsync(app.express, alice.uuid, token)
    })

    it('time', done => {
      request(app.express)
        .post(`/drives/${home.uuid}/dirs/${home.uuid}/entries`)
        .set('Authorization', 'JWT ' + token)
        .field('foo', JSON.stringify({ op: 'mkdir' }))
        .expect(200)
        .end((err, res) => {
          if (err) return done(err)
          let foo = res.body[0].data

          request(app.express)
            .post(`/drives/${home.uuid}/dirs/${foo.uuid}/entries`)
            .set('Authorization', 'JWT ' + token)
            .attach('alonzo.jpg', alonzo.path, JSON.stringify({
              op: 'newfile',
              size: alonzo.size,
              sha256: alonzo.hash
            }))
            .expect(200)
            .end((err, res) => {
              if (err) return done(err)

              setTimeout(() => {
                let types = 'JPEG'
                request(app.express)
                  .get('/files')
                  .set('Authorization', 'JWT ' + token)
                  .query({ places: home.uuid, types, metadata: true, namepath: true })
                  .expect(200)
                  .end((err, res) => {
                    if (err) return done(err)
                    console.log(res.body)
                    done()
                  })
              }, 200)
            })
        })
    })
  })

  describe('async', () => {
    let watson, user

    beforeEach(async () => {
      await rimrafAsync(tmptest)
      await mkdirpAsync(fruitmixDir)

      let userFile = path.join(fruitmixDir, 'users.json')
      await fs.writeFileAsync(userFile, JSON.stringify([alice], null, '  '))

      let fruitmix = new Fruitmix({ fruitmixDir })
      let app = new App({ fruitmix, log: { skip: 'all', error: 'none' } })
      await new Promise(res => fruitmix.once('FruitmixStarted', () => res()))

      watson = new Watson({ app }) 
      await new Promise((res, rej) => watson.login('alice', 'alice', err => err ? rej(err) : res()))
      user = watson.users.alice
    })

    it('visit async', async () => {
      let tree = await user.mktreeAsync({
        type: 'vfs',
        drive: user.home.uuid,
        dir: user.home.uuid,
        children: [
          {   
            type: 'directory', 
            name: 'foo',
            children: [
              {
                type: 'directory',
                name: 'bar'
              },
              {
                type: 'file',
                name: 'alonzo',
                file: alonzo.path,
                size: alonzo.size,
                sha256: alonzo.hash
              },
              {
                type: 'file',
                name: 'hello',
                file: hello.path,
                size: hello.size,
                sha256: hello.hash            
              },
              {
                type: 'file',
                name: pdf.name,
                file: pdf.path,
                size: pdf.size,
                sha256: pdf.hash
              }
            ]
          }
        ]
      }) 

      await Promise.delay(1000)

      let r = await user.getFilesStepByStep({ places: user.home.uuid }, 1)
      console.log(JSON.stringify(tree, null, '  '))
      console.log(r)
    })

    it ('visit rename visit', async () => {
      let tree = await user.mktreeAsync({
        type: 'vfs',
        drive: user.home.uuid,
        dir: user.home.uuid,
        children: [
          {
            type: 'file',
            name: alonzo.name,
            file: alonzo.path,
            size: alonzo.size,
            sha256: alonzo.hash
          }
        ]
      }) 

      await Promise.delay(200)

      let r = await user.getFilesAsync({ order: 'find', places: user.home.uuid })

      console.log(r)
    })
  })
})
