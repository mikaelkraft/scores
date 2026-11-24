const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('predictions-context H2H deduplication uses declared allLifetimeH2h without ReferenceError', () => {
    const controllerPath = path.join(__dirname, '..', 'controllers', 'footballApiController.js');
    const source = fs.readFileSync(controllerPath, 'utf8');

    assert.equal(
        source.includes('allRecentH2h'),
        false,
        'footballApiController.js must not reference undeclared allRecentH2h'
    );
    assert.match(
        source,
        /for\s*\(\s*const\s+m\s+of\s+allLifetimeH2h\s*\)/,
        'H2H dedup loop must iterate over allLifetimeH2h'
    );
    assert.match(
        source,
        /allLifetimeH2h\.length\s*=\s*0;/,
        'H2H dedup block must mutate allLifetimeH2h in place'
    );
});
