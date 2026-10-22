import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from './ErrorBoundary';

let shouldThrow;
const Bomb = () => {
  if (shouldThrow) throw new Error('boom');
  return <p>содержимое</p>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = false;
    // React и componentDidCatch пишут перехваченную ошибку в console.error: тест её ожидает.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('без ошибки показывает дочерние элементы', () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);

    expect(screen.getByText('содержимое')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('при ошибке рендера показывает сообщение и кнопку «Повторить»', () => {
    shouldThrow = true;
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);

    expect(screen.getByRole('alert')).toHaveTextContent('Что-то пошло не так');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
    expect(screen.queryByText('содержимое')).not.toBeInTheDocument();
  });

  test('ошибка записывается в console.error', () => {
    shouldThrow = true;
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);

    expect(console.error).toHaveBeenCalledWith('ErrorBoundary', expect.objectContaining({ message: 'boom' }), expect.any(String));
  });

  test('«Повторить» сбрасывает границу и отрисовывает дочерние элементы заново', async () => {
    shouldThrow = true;
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    shouldThrow = false;

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(screen.getByText('содержимое')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('если ошибка повторяется, снова показывается запасной экран', async () => {
    shouldThrow = true;
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Что-то пошло не так');
  });

  test('actionLabel и onAction заменяют кнопку и сброс (корень: перезагрузка страницы)', async () => {
    shouldThrow = true;
    const onAction = jest.fn();
    render(<ErrorBoundary actionLabel="Перезагрузить страницу" onAction={onAction}><Bomb /></ErrorBoundary>);

    await userEvent.click(screen.getByRole('button', { name: 'Перезагрузить страницу' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
