import reducer, { addChat } from './chats';

describe('chats reducer', () => {
  it('добавляет чат с сгенерированным id', () => {
    const state = reducer([], addChat({ title: 'General' }));
    expect(state).toHaveLength(1);
    expect(state[0].title).toBe('General');
    expect(state[0].id).toBeTruthy();
  });
});
