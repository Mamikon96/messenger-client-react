import { render, screen, fireEvent } from '@testing-library/react';
import MessageStatus from './MessageStatus';

describe('MessageStatus', () => {
  it('sent — одна галка «Отправлено»', () => {
    render(<MessageStatus status="sent" />);

    expect(screen.getByRole('img', { name: 'Отправлено' })).toBeInTheDocument();
  });

  it('read — две галки «Прочитано»', () => {
    render(<MessageStatus status="read" />);

    expect(screen.getByRole('img', { name: 'Прочитано' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Отправлено' })).not.toBeInTheDocument();
  });

  it('sending — часы «Отправляется»', () => {
    render(<MessageStatus status="sending" />);

    expect(screen.getByRole('img', { name: 'Отправляется' })).toBeInTheDocument();
  });

  it('failed — кнопка «Не отправлено. Повторить» вызывает onRetry', () => {
    const onRetry = jest.fn();
    render(<MessageStatus status="failed" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Не отправлено. Повторить' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
