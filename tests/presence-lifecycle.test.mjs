import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/app/PresenceProvider.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const settle = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function events() {
  const listeners = new Map();
  return {
    addEventListener(name, handler) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(handler);
    },
    removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
    emit(name, event) { for (const handler of listeners.get(name) ?? []) handler(event); },
    count() { return [...listeners.values()].reduce((sum, handlers) => sum + handlers.size, 0); },
  };
}

function harness(options = {}) {
  const session = { data: { session: { access_token: "mock-session" } } };
  const profile = { data: { availability: "available", show_activity_status: true, inactive_mode: false, ...options.profile } };
  const sessions = [];
  const profiles = [];
  const authorizations = [];
  const removals = [];
  const created = [];
  const activeChannels = new Map();
  const document = events();
  const window = events();
  const warnings = [];
  let rendering;
  const client = {
    auth: { getSession() {
      const request = deferred();
      sessions.push(request);
      if (!options.deferSession) request.resolve(session);
      return request.promise;
    } },
    realtime: { setAuth() {
      const request = deferred();
      authorizations.push(request);
      if (!options.deferAuth) request.resolve();
      return request.promise;
    } },
    from() { return { select() { return this; }, eq() { return this; }, maybeSingle() {
      const request = deferred();
      profiles.push(request);
      if (!options.deferProfile) request.resolve(profile);
      return request.promise;
    } }; },
    channel(topic) {
      // Match the installed Supabase client's topic reuse during async removal.
      if (activeChannels.has(topic)) return activeChannels.get(topic);
      const channel = {
        topic, subscriptions: 0, tracks: [], callbacks: [], state: {},
        on(_kind, _filter, callback) { this.callbacks.push(callback); return this; },
        subscribe(callback) { this.subscriptions++; this.onSubscribe = callback; return this; },
        presenceState() { return this.state; },
        async track(value) { this.tracks.push(value); },
        async untrack() {},
        emit(value) { this.state = { user: [value] }; this.callbacks.forEach((callback) => callback()); },
      };
      activeChannels.set(topic, channel);
      created.push(channel);
      return channel;
    },
    removeChannel(channel) {
      const request = deferred();
      removals.push({ channel, ...request });
      if (!options.deferRemoval) request.resolve("ok");
      return request.promise.then((status) => {
        if (activeChannels.get(channel.topic) === channel) activeChannels.delete(channel.topic);
        return status;
      });
    },
  };
  const react = {
    createContext: () => ({ Provider: "provider" }),
    useMemo: (factory) => factory(), useCallback: (callback) => callback,
    useRef: (value) => ({ current: value }),
    useEffect: (effect) => { rendering.effects.push(effect); },
    useState: (initial) => {
      const owner = rendering;
      owner.state = typeof initial === "function" ? initial() : initial;
      return [owner.state, (value) => {
        owner.state = typeof value === "function" ? value(owner.state) : value;
        owner.updates++;
      }];
    },
  };
  const testModule = { exports: {} };
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports, document, window,
    console: { warn: (message) => warnings.push(message) },
    require: (name) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }) };
      if (name === "@/lib/supabase/client") return { createClient: () => client };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  function provider(userId = "self") {
    const instance = { effects: [], cleanups: [], updates: 0 };
    rendering = instance;
    instance.context = testModule.exports.default({ userId, children: null }).props.value;
    instance.mount = () => { instance.cleanups = instance.effects.map((effect) => effect()); };
    instance.unmount = () => { instance.cleanups.forEach((cleanup) => cleanup?.()); };
    return instance;
  }
  return { provider, created, sessions, profiles, authorizations, removals, session, profile, document, window, warnings };
}

test("cleanup during own session loading never starts a channel or profile query", async () => {
  const h = harness({ deferSession: true });
  const p = h.provider(); p.mount(); p.unmount();
  h.sessions[0].resolve(h.session);
  await settle();
  assert.equal(h.created.length, 0);
  assert.equal(h.profiles.length, 0);
  assert.equal(h.authorizations.length, 0);
  assert.equal(h.document.count() + h.window.count(), 0);
});

test("cleanup during own profile loading prevents a late subscription", async () => {
  const h = harness({ deferProfile: true });
  const p = h.provider(); p.mount();
  await settle(); p.unmount();
  h.profiles[0].resolve(h.profile);
  await settle();
  assert.equal(h.created.length, 0);
});

test("unwatch during session loading prevents a late target subscription", async () => {
  const h = harness({ deferSession: true });
  const p = h.provider();
  p.context.watch("contact"); p.context.unwatch("contact");
  h.sessions[0].resolve(h.session);
  await settle();
  assert.equal(h.created.length, 0);
  assert.equal(h.authorizations.length, 0);
});

test("unwatch during realtime authorization also prevents subscription", async () => {
  const h = harness({ deferAuth: true });
  const p = h.provider(); p.context.watch("contact");
  await settle(); p.context.unwatch("contact");
  h.authorizations[0].resolve();
  await settle();
  assert.equal(h.created.length, 0);
});

test("repeated watchers share one channel until the final unwatch", async () => {
  const h = harness();
  const p = h.provider(); p.context.watch("contact"); p.context.watch("contact");
  await settle();
  assert.equal(h.created.length, 1);
  assert.equal(h.created[0].subscriptions, 1);
  p.context.unwatch("contact");
  assert.equal(h.removals.length, 0);
  p.context.unwatch("contact");
  assert.equal(h.removals.length, 1);
});

test("removed channels cannot publish stale state into a replacement watcher", async () => {
  const h = harness({ deferRemoval: true });
  const p = h.provider(); p.context.watch("contact");
  await settle();
  const old = h.created[0];
  p.context.unwatch("contact"); p.context.watch("contact");
  await settle();
  assert.equal(h.created.length, 1, "replacement waits for same-topic removal");
  const updates = p.updates;
  old.emit({ online: true });
  assert.equal(p.updates, updates);
  h.removals[0].resolve("ok");
  await settle();
  assert.equal(h.created.length, 2);
  assert.equal(h.created[1].subscriptions, 1);
  assert.equal(old.subscriptions, 1);
  h.created[1].emit({ online: true });
  assert.equal(p.state.get("contact").online, true);
});

test("focus reconnect keeps reference counts and waits for pending removal", async () => {
  const h = harness({ deferRemoval: true });
  const p = h.provider(); p.mount();
  p.context.watch("contact"); p.context.watch("contact");
  await settle();
  h.window.emit("focus");
  p.context.unwatch("contact");
  await settle();
  assert.equal(h.created.filter((channel) => channel.topic.endsWith(":contact")).length, 1);
  h.removals[0].resolve("ok");
  await settle();
  assert.equal(h.created.filter((channel) => channel.topic.endsWith(":contact")).length, 2);
  p.context.unwatch("contact");
  assert.equal(h.removals.length, 2, "remaining watcher released its replacement");
});

test("unmount while reconnecting does not recreate target channels", async () => {
  const h = harness({ deferRemoval: true });
  const p = h.provider(); p.mount(); p.context.watch("contact");
  await settle();
  h.window.emit("focus"); p.unmount();
  h.removals.forEach((request) => request.resolve("ok"));
  await settle();
  assert.equal(h.created.filter((channel) => channel.topic.endsWith(":contact")).length, 1);
  assert.equal(h.document.count() + h.window.count(), 0);
});

test("provider remount waits before recreating its own same-topic channel", async () => {
  const h = harness({ deferRemoval: true });
  const first = h.provider(); first.mount();
  await settle(); first.unmount();
  const second = h.provider(); second.mount();
  await settle();
  assert.equal(h.created.length, 1);
  await h.created[0].onSubscribe("SUBSCRIBED");
  assert.equal(h.created[0].tracks.length, 0, "old subscription callback is inert");
  h.removals[0].resolve("ok");
  await settle();
  assert.equal(h.created.length, 2);
  await h.created[1].onSubscribe("SUBSCRIBED");
  assert.equal(h.created[1].tracks.length, 1);
});

test("existing paused and hidden presence settings still prevent tracking", async () => {
  for (const profile of [{ inactive_mode: true }, { show_activity_status: false }]) {
    const h = harness({ profile });
    const p = h.provider(); p.mount();
    await settle();
    await h.created[0].onSubscribe("SUBSCRIBED");
    assert.equal(h.created[0].tracks.length, 0);
    assert.deepEqual(h.warnings, []);
    p.unmount();
  }
});
