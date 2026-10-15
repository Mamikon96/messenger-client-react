import reducer, { selectUserById, selectUsers, usersReceived } from './users';

const ann = { id: 'u1', name: 'Ann', avatarUrl: '' };
const bob = { id: 'u2', name: 'Bob', avatarUrl: 'http://a/b.png' };

describe('users reducer', () => {
  it('начальное состояние — пустая нормализованная коллекция', () => {
    expect(reducer(undefined, { type: '@@init' })).toEqual({ ids: [], entities: {} });
  });

  it('usersReceived добавляет новых и обновляет существующих по id', () => {
    let state = reducer(undefined, usersReceived([ann, bob]));
    state = reducer(state, usersReceived([{ ...ann, name: 'Anna' }]));

    expect(state.ids).toEqual(['u1', 'u2']);
    expect(state.entities.u1.name).toBe('Anna');
    expect(state.entities.u2).toEqual(bob);
  });

  it('селекторы selectUsers и selectUserById', () => {
    const state = { users: reducer(undefined, usersReceived([ann, bob])) };

    expect(selectUsers(state)).toEqual([ann, bob]);
    expect(selectUserById(state, 'u2')).toEqual(bob);
    expect(selectUserById(state, 'nope')).toBeUndefined();
  });
});
