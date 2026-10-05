import reducer, { addMessage } from './messages';

describe('messages reducer', () => {
  it('начальное состояние — пустой список', () => {
    expect(reducer(undefined, { type: '@@init' })).toEqual([]);
  });

  it('добавляет сообщение с id и временем', () => {
    const before = Date.now();
    const state = reducer([], addMessage({ chatId: 'c1', authorId: 'u1', text: 'Привет' }));

    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({ chatId: 'c1', authorId: 'u1', text: 'Привет' });
    expect(state[0].id).toBeTruthy();
    expect(state[0].ts).toBeGreaterThanOrEqual(before);
  });

  it('сохраняет порядок отправки и даёт разные id', () => {
    let state = reducer([], addMessage({ chatId: 'c1', authorId: 'u1', text: 'a' }));
    state = reducer(state, addMessage({ chatId: 'c2', authorId: 'u1', text: 'b' }));

    expect(state.map((m) => m.text)).toEqual(['a', 'b']);
    expect(state[0].id).not.toBe(state[1].id);
  });
});
