'use strict';

const test = require('node:test');
const assert = require('node:assert');

const MODULE_PATH = require.resolve('../skyTrail.js');

// Le module garde son état (enabled, target, cache…) dans des variables de
// clôture partagées entre tous les appels d un même `require`. On repart d
// une instance vierge à chaque test pour ne pas laisser un test polluer le
// suivant — cf. note de la tâche : purger `require.cache` avant de
// re-require donne une nouvelle clôture, donc un nouvel `enabled` etc.
function freshSkyTrail() {
    delete require.cache[MODULE_PATH];
    return require('../skyTrail.js');
}

// Faux moteur minimal : juste assez pour que `recompute()` (appelé en interne
// par `setTarget`) aille jusqu au bout et clone l observateur — ce qui nous
// sert de sonde pour savoir si le pipeline a vraiment tourné, sans dépendre
// du DOM (absent sous Node).
function makeEngine() {
    const state = { cloned: 0, destroyed: 0 };
    const designations = ['NAME Test Object'];

    function makeObserver() {
        return {
            utc: 0,
            update() {},
            clone() { state.cloned++; return makeObserver(); },
            destroy() { state.destroyed++; },
        };
    }

    const observer = makeObserver();

    const obj = {
        designations() { return designations; },
        jsonData: { types: ['Pla'] },
        getInfo(what) {
            if (what !== 'radec') return null;
            return { tMs: 0 };
        },
    };

    const engine = {
        core: { selection: obj, observer: observer },
        convertFrame(obs, from, to, p) { return p; },
        c2s() { return [0, 0.5]; }, // altitude > 0 : au-dessus de l horizon
    };

    return { engine: engine, obj: obj, observer: observer, state: state };
}

test('setTarget(null, null) puis un bon appel : le second doit fonctionner normalement (pas de latch)', () => {
    const SkyTrail = freshSkyTrail();
    const previousStel = globalThis.stel;
    try {
        const f = makeEngine();
        globalThis.stel = f.engine;

        // Appel raté ordinaire (ex. avant que stel.core.observer existe) :
        // ne doit PAS désactiver la fonctionnalité pour la suite.
        SkyTrail.setTarget(null, null, 1000);

        // Bon appel juste après : c est la régression du bug. Avant le
        // correctif, `enabled` restait à `false` pour toujours et cet appel
        // ne produisait plus jamais rien.
        SkyTrail.setTarget(f.obj, f.observer, 1000);

        assert.strictEqual(
            f.state.cloned, 1,
            'recompute() doit avoir cloné l observateur du moteur : la course a bien été recalculée après l appel raté'
        );
    } finally {
        globalThis.stel = previousStel;
        SkyTrail.clear();
    }
});

test('observateur sans clone() : latch la fonctionnalité éteinte, un bon appel ensuite reste sans effet', () => {
    const SkyTrail = freshSkyTrail();
    const previousStel = globalThis.stel;
    const previousWarn = console.warn;
    const warnCalls = [];
    console.warn = (...args) => warnCalls.push(args);
    try {
        const f = makeEngine();
        globalThis.stel = f.engine;
        const badObserver = { utc: 0, update() {} }; // pas de clone()

        SkyTrail.setTarget(f.obj, badObserver, 1000);
        // Un bon appel derrière ne doit RIEN changer : incapacité durable du
        // moteur, pas un raté ponctuel.
        SkyTrail.setTarget(f.obj, f.observer, 2000);

        assert.strictEqual(
            f.state.cloned, 0,
            'recompute() ne doit jamais avoir tourné : la fonctionnalité reste désactivée pour la session'
        );
        assert.strictEqual(warnCalls.length, 1, 'un avertissement doit avoir été émis');
    } finally {
        console.warn = previousWarn;
        globalThis.stel = previousStel;
        SkyTrail.clear();
    }
});

test('deux appels avec un observateur sans clone() n émettent qu un seul avertissement', () => {
    const SkyTrail = freshSkyTrail();
    const previousWarn = console.warn;
    const warnCalls = [];
    console.warn = (...args) => warnCalls.push(args);
    try {
        const badObserver = { utc: 0, update() {} };
        const obj = { designations() { return ['NAME Autre Astre']; }, jsonData: { types: ['Pla'] } };

        SkyTrail.setTarget(obj, badObserver, 1000);
        SkyTrail.setTarget(obj, badObserver, 2000);

        assert.strictEqual(warnCalls.length, 1, 'le garde-fou doit empêcher toute répétition de l avertissement');
    } finally {
        console.warn = previousWarn;
        SkyTrail.clear();
    }
});

test('obj ou observer manquant seul (sans mauvais clone) ne touche jamais enabled', () => {
    const SkyTrail = freshSkyTrail();
    const previousStel = globalThis.stel;
    const previousWarn = console.warn;
    const warnCalls = [];
    console.warn = (...args) => warnCalls.push(args);
    try {
        const f = makeEngine();
        globalThis.stel = f.engine;

        SkyTrail.setTarget(f.obj, null, 1000);
        SkyTrail.setTarget(null, f.observer, 1500);
        SkyTrail.setTarget(f.obj, f.observer, 2000);

        assert.strictEqual(f.state.cloned, 1, 'le dernier appel, correct, doit avoir tourné normalement');
        assert.strictEqual(warnCalls.length, 0, 'un argument manquant ne justifie aucun avertissement');
    } finally {
        console.warn = previousWarn;
        globalThis.stel = previousStel;
        SkyTrail.clear();
    }
});
