import { rootReducer } from './store';
import { addChat } from './reducers/chats';
import { setActiveChat } from './reducers/activeChat';
import { addUser } from './reducers/users';
import { checkSession, logout } from './reducers/auth';

const user = { id: '1', name: 'Ann', avatarUrl: 'http://a/b.png', provider: 'google' };

const filledState = () => {
  let state = rootReducer(undefined, { type: '@@init' });
  state = rootReducer(state, addChat({ title: 'Room', name: 'Ann' }));
  state = rootReducer(state, addUser({ name: 'Ann' }));
  state = rootReducer(state, setActiveChat({ title: 'Room' }));
  return rootReducer(state, checkSession.fulfilled(user, 'req'));
};

describe('rootReducer: сброс store при выходе', () => {
  it('до выхода в store есть чаты, пользователи, активный чат и user', () => {
    const state = filledState();

    expect(state.chats).toHaveLength(1);
    expect(state.users).toHaveLength(1);
    expect(state.activeChat).toEqual({ title: 'Room' });
    expect(state.auth).toEqual({ status: 'authenticated', user });
  });

  it('logout.fulfilled одним действием сбрасывает все слайсы, auth → anonymous', () => {
    const state = rootReducer(filledState(), logout.fulfilled(undefined, 'req'));

    expect(state).toEqual({
      chats: [],
      users: [],
      activeChat: {},
      auth: { status: 'anonymous', user: null },
    });
  });

  it('logout.rejected store не сбрасывает', () => {
    const before = filledState();
    const after = rootReducer(before, logout.rejected(new Error('x'), 'req'));

    expect(after).toEqual(before);
  });
});
