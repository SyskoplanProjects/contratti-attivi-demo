const store = require('../srv/lib/preview-store');

describe('preview-store', () => {
  it('put then get returns the same data', () => {
    const id = store.put({ foo: 'bar' });
    expect(store.get(id)).toEqual({ foo: 'bar' });
  });

  it('get on an unknown id returns null', () => {
    expect(store.get('non-esiste')).toBeNull();
  });

  it('get after expiry returns null', async () => {
    const id = store.put({ foo: 'bar' }, 1);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(store.get(id)).toBeNull();
  });

  it('remove deletes the entry', () => {
    const id = store.put({ foo: 'bar' });
    store.remove(id);
    expect(store.get(id)).toBeNull();
  });
});
