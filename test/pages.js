const t = require('../test-lib/test.js');
const assert = require('assert');
const _ = require('lodash');
const request = require('request-promise');

let apos;
let homeId;

describe('Pages', function() {

  this.timeout(t.timeout);

  after(function() {
    return t.destroy(apos);
  });

  // EXISTENCE

  it('should be a property of the apos object', async function() {
    apos = await require('../index.js')({
      root: module,
      shortName: 'test',
      argv: {
        _: []
      },
      modules: {
        'apostrophe-express': {
          options: {
            session: {
              secret: 'Adipiscing'
            },
            port: 7900
          }
        },
        'apostrophe-pages': {
          options: {
            park: [],
            types: [
              {
                name: 'home',
                label: 'Home'
              },
              {
                name: 'testPage',
                label: 'Test Page'
              }
            ]
          }
        }
      }
    });

    assert(apos.pages.__meta.name === 'apostrophe-pages');
  });

  // SETUP

  it('should make sure all of the expected indexes are configured', async function() {
    const expectedIndexes = ['path'];
    const actualIndexes = [];

    const info = await apos.docs.db.indexInformation();

    // Extract the actual index info we care about
    _.each(info, function(index) {
      actualIndexes.push(index[0][0]);
    });

    // Now make sure everything in expectedIndexes is in actualIndexes
    _.each(expectedIndexes, function(index) {
      assert(_.includes(actualIndexes, index));
    });
  });

  it('parked homepage exists', async function() {
    const home = await apos.pages.find(apos.tasks.getAnonReq(), { level: 0 }).toObject();

    assert(home);
    homeId = home._id;
    assert(home.slug === '/');
    assert(home.path === home._id);
    assert(home.type === 'home');
    assert(home.parked);
    assert(home.published);
  });

  it('parked trash can exists', async function() {
    console.log(JSON.stringify(await apos.docs.db.find({ slug: /^\// }).project({ path: 1, rank: 1, slug: 1 }).toArray(), null, '  '));
    const trash = await apos.pages.find(apos.tasks.getReq(), { slug: '/trash' }).published(null).trash(null).toObject();
    assert(trash);
    assert(trash.slug === '/trash');
    assert(trash.path === `${homeId}/${trash._id}`);
    assert(trash.type === 'trash');
    assert(trash.parked);
    assert(!trash.published);
    // Verify that clonePermanent did its
    // job and removed properties not meant
    // to be stored in mongodb
    assert(!trash._children);
  });

  it('should be able to use db to insert documents', async function() {
    const testItems = [
      { _id: 'parent',
        type: 'testPage',
        slug: '/parent',
        published: true,
        path: `${homeId}/parent`,
        level: 1,
        rank: 0
      },
      {
        _id: 'child',
        type: 'testPage',
        slug: '/child',
        published: true,
        path: `${homeId}/parent/child`,
        level: 2,
        rank: 0
      },
      {
        _id: 'grandchild',
        type: 'testPage',
        slug: '/grandchild',
        published: true,
        path: `${homeId}/parent/child/grandchild`,
        level: 3,
        rank: 0
      },
      {
        _id: 'sibling',
        type: 'testPage',
        slug: '/sibling',
        published: true,
        path: `${homeId}/parent/sibling`,
        level: 2,
        rank: 1

      },
      {
        _id: 'cousin',
        type: 'testPage',
        slug: '/cousin',
        published: true,
        path: `${homeId}/parent/sibling/cousin`,
        level: 3,
        rank: 0
      },
      {
        _id: 'another-parent',
        type: 'testPage',
        slug: '/another-parent',
        published: true,
        path: `${homeId}/another-parent`,
        level: 1,
        rank: 0
      }
    ];

    const items = await apos.docs.db.insertMany(testItems);

    assert(items.result.ok === 1);
    assert(items.insertedCount === 6);
  });

  // FINDING

  it('should have a find method on pages that returns a cursor', async function() {
    const cursor = apos.pages.find(apos.tasks.getAnonReq());
    assert(cursor);
  });

  it('should be able to find the parked homepage', async function() {
    const cursor = apos.pages.find(apos.tasks.getAnonReq(), { slug: '/' });

    const page = await cursor.toObject();

    // There should be only 1 result.
    assert(page);
    assert(page.path === page._id);
    assert(page.rank === 0);
  });

  it('should be able to find just a single page', async function() {
    const cursor = apos.pages.find(apos.tasks.getAnonReq(), { slug: '/child' });

    const page = await cursor.toObject();

    // There should be only 1 result.
    assert(page);
    // It should have a path of /parent/child
    assert(page.path === `${homeId}/parent/child`);
  });

  it('should be able to include the ancestors of a page', async function() {
    const cursor = apos.pages.find(apos.tasks.getAnonReq(), { slug: '/child' });

    const page = await cursor.ancestors(true).toObject();

    // There should be only 1 result.
    assert(page);
    // There should be 2 ancestors.
    assert(page._ancestors.length === 2);
    // The first ancestor should be the homepage
    assert.strictEqual(page._ancestors[0].path, homeId);
    // The second ancestor should be 'parent'
    assert.strictEqual(page._ancestors[1].path, `${homeId}/parent`);
  });

  it('should be able to include just one ancestor of a page, i.e. the parent', async function() {
    const cursor = apos.pages.find(apos.tasks.getAnonReq(), { slug: '/child' });

    const page = await cursor.ancestors({ depth: 1 }).toObject();

    // There should be only 1 result.
    assert(page);
    // There should be 1 ancestor returned.
    assert(page._ancestors.length === 1);
    // The first ancestor returned should be 'parent'
    assert.strictEqual(page._ancestors[0].path, `${homeId}/parent`);
  });

  it('should be able to include the children of the ancestors of a page', async function() {
    const cursor = apos.pages.find(apos.tasks.getAnonReq(), { slug: '/child' });

    const page = await cursor.ancestors({ children: 1 }).toObject();

    // There should be only 1 result.
    assert(page);
    // There should be 2 ancestors.
    assert(page._ancestors.length === 2);
    // The second ancestor should have children
    assert(page._ancestors[1]._children);
    // The first ancestor's child should have a path '/parent/child'
    assert.strictEqual(page._ancestors[1]._children[0].path, `${homeId}/parent/child`);
    // The second ancestor's child should have a path '/parent/sibling'
    assert.strictEqual(page._ancestors[1]._children[1].path, `${homeId}/parent/sibling`);
  });

  // INSERTING

  it('is able to insert a new page', async function() {
    const parentId = 'parent';

    const newPage = {
      slug: '/new-page',
      published: true,
      type: 'testPage',
      title: 'New Page'
    };

    const page = await apos.pages.insert(apos.tasks.getReq(), parentId, 'lastChild', newPage);

    // Is the path generally correct?
    assert.strictEqual(page.path, `${homeId}/parent/${page._id}`);
  });

  it('is able to insert a new page in the correct order', async function() {
    const cursor = apos.pages.find(apos.tasks.getAnonReq(), {
      slug: '/new-page'
    });

    const page = await cursor.toObject();

    assert(page);
    assert.strictEqual(page.rank, 2);
  });

  // MOVING

  it('is able to move root/parent/sibling/cousin after root/parent', async function() {
    await apos.pages.move(apos.tasks.getReq(), 'cousin', 'parent', 'after');

    const cursor = apos.pages.find(apos.tasks.getAnonReq(), { _id: 'cousin' });

    const page = await cursor.toObject();

    // Is the new path correct?
    assert.strictEqual(page.path, `${homeId}/cousin`);
    // Is the rank correct?
    assert.strictEqual(page.rank, 1);
  });

  it('is able to move root/cousin before root/parent/child', async function() {
    // 'Cousin' _id === 4312
    // 'Child' _id === 2341

    await apos.pages.move(apos.tasks.getReq(), 'cousin', 'child', 'before');
    const cursor = apos.pages.find(apos.tasks.getAnonReq(), { _id: 'cousin' });
    const page = await cursor.toObject();

    // Is the new path correct?
    assert.strictEqual(page.path, `${homeId}/parent/cousin`);
    // Is the rank correct?
    assert.strictEqual(page.rank, 0);
  });

  it('is able to move root/parent/cousin inside root/parent/sibling', async function() {
    await apos.pages.move(apos.tasks.getReq(), 'cousin', 'sibling', 'firstChild');

    const cursor = apos.pages.find(apos.tasks.getAnonReq(), { _id: 'cousin' });
    const page = await cursor.toObject();

    // Is the new path correct?
    assert.strictEqual(page.path, `${homeId}/parent/sibling/cousin`);
    // Is the rank correct?
    assert.strictEqual(page.rank, 0);
  });

  it('moving /parent into /another-parent should also move /parent/sibling', async function() {
    await apos.pages.move(apos.tasks.getReq(), 'parent', 'another-parent', 'firstChild');

    const cursor = apos.pages.find(apos.tasks.getAnonReq(), { _id: 'sibling' });
    const page = await cursor.toObject();

    // Is the grandchild's path correct?
    assert.strictEqual(page.path, `${homeId}/another-parent/parent/sibling`);
  });

  it('should be able to serve a page', async function() {
    const response = await request({
      uri: 'http://localhost:7900/child',
      method: 'GET',
      resolveWithFullResponse: true
    });

    // Is our status code good?
    assert.strictEqual(response.statusCode, 200);
    // Did we get our page back?
    assert(response.body.match(/Sing to me, Oh Muse./));
    // Does the response prove that data.home was available?
    assert(response.body.match(/Home: \//));
    // Does the response prove that data.home._children was available?
    assert(response.body.match(/Tab: \/another-parent/));
  });

  it('should not be able to serve a nonexistent page', async function() {
    const response = await request({
      method: 'GET',
      resolveWithFullResponse: true,
      uri: 'http://localhost:7900/nobodyschild',
      // Get a rejection only if the request failed for technical reasons
      simple: false
    });

    // Is our status code good?
    assert.strictEqual(response.statusCode, 404);
    // Does the response prove that data.home was available?
    assert(response.body.match(/Home: \//));
    // Does the response prove that data.home._children was available?
    assert(response.body.match(/Tab: \/another-parent/));
  });

  it('should detect that the home page is an ancestor of any page except itself', function() {
    assert(
      // actual paths are made up of _ids in 3.x
      apos.pages.isAncestorOf({
        path: 'home'
      }, {
        path: 'home/about'
      })
    );
    assert(
      apos.pages.isAncestorOf({
        path: 'home'
      }, {
        path: 'home/about/grandkid'
      })
    );
    assert(!apos.pages.isAncestorOf({
      path: 'home'
    }, {
      path: 'home'
    }));
  });

  it('should detect a tab as the ancestor of its great grandchild but not someone else\'s', function() {
    assert(
      apos.pages.isAncestorOf({
        path: 'home/about'
      }, {
        path: 'home/about/test/thing'
      })
    );

    assert(
      !apos.pages.isAncestorOf({
        path: 'home/about'
      }, {
        path: 'home/wiggy/test/thing'
      })
    );

  });

  it('is able to move parent to the trash', async function() {
    await apos.pages.moveToTrash(apos.tasks.getReq(), 'parent');

    const cursor = apos.pages.find(apos.tasks.getAnonReq(), { _id: 'parent' });
    const page = await cursor.toObject();

    assert(!page);

    const req = apos.tasks.getReq();
    const trash = await apos.pages.findOneForEditing(req, { parkedId: 'trash' });
    const trashed = await apos.pages.findOneForEditing(req, {
      _id: 'parent'
    });
    assert.strictEqual(trashed.path, `${homeId}/${trash._id}/${trashed._id}`);
    assert(trashed.trash);
    assert.strictEqual(trashed.level, 2);
  });
});
