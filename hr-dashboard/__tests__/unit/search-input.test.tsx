import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SearchInput } from '@/components/ui/search-input'

describe('SearchInput', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('preserves all characters during rapid typing', async () => {
    const user = userEvent.setup()

    render(<SearchInput onChange={vi.fn()} debounceMs={1000} />)

    const input = screen.getByRole('searchbox')
    await user.type(input, 'software')

    expect(input).toHaveValue('software')
  })

  it('calls onChange only after the debounce delay', async () => {
    const onChange = vi.fn()
    vi.useFakeTimers()

    render(<SearchInput onChange={onChange} debounceMs={300} />)

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'test' },
    })

    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('test')
  })

  it('does not reset local input when a stale controlled value catches up', async () => {
    const onChange = vi.fn()
    vi.useFakeTimers()
    const { rerender } = render(
      <SearchInput value="ab" onChange={onChange} debounceMs={300} />,
    )

    const input = screen.getByRole('searchbox')
    fireEvent.change(input, {
      target: { value: 'abc' },
    })
    expect(input).toHaveValue('abc')

    rerender(<SearchInput value="ab" onChange={onChange} debounceMs={300} />)
    expect(input).toHaveValue('abc')

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onChange).toHaveBeenCalledWith('abc')

    rerender(<SearchInput value="abc" onChange={onChange} debounceMs={300} />)
    expect(input).toHaveValue('abc')
  })

  it('clears immediately and does not emit a second debounced clear event', async () => {
    const onChange = vi.fn()
    vi.useFakeTimers()

    render(<SearchInput value="test" onChange={onChange} debounceMs={300} />)

    fireEvent.click(screen.getByRole('button', { name: /clear search/i }))

    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('')

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('syncs when the controlled value is cleared externally', () => {
    const { rerender } = render(<SearchInput value="test" onChange={vi.fn()} />)

    expect(screen.getByRole('searchbox')).toHaveValue('test')

    rerender(<SearchInput value="" onChange={vi.fn()} />)

    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('applies an external clear even while a debounced local edit is pending', () => {
    const onChange = vi.fn()
    vi.useFakeTimers()
    const { rerender } = render(
      <SearchInput value="ab" onChange={onChange} debounceMs={300} />,
    )

    const input = screen.getByRole('searchbox')
    fireEvent.change(input, {
      target: { value: 'abc' },
    })
    expect(input).toHaveValue('abc')

    rerender(<SearchInput value="" onChange={onChange} debounceMs={300} />)

    expect(input).toHaveValue('')
  })

  it('applies an intentional shorter controlled value instead of treating it as stale catch-up', () => {
    const onChange = vi.fn()
    vi.useFakeTimers()
    const { rerender } = render(
      <SearchInput value="abc" onChange={onChange} debounceMs={300} />,
    )

    const input = screen.getByRole('searchbox')
    fireEvent.change(input, {
      target: { value: 'abcd' },
    })
    expect(input).toHaveValue('abcd')

    rerender(<SearchInput value="ab" onChange={onChange} debounceMs={300} />)

    expect(input).toHaveValue('ab')
  })
})
