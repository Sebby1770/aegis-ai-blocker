import { useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { useSaas } from '../lib/saas-context'

export function MagicLinkForm() {
  const { authLoading, sendMagicLink } = useSaas()
  const [email, setEmail] = useState('')

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await sendMagicLink(email)
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <label className="tester-input">
        <span>Email</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
          required
        />
      </label>
      <button className="primary-button" type="submit" disabled={authLoading}>
        <KeyRound size={17} />
        {authLoading ? 'Sending…' : 'Send sign-in link'}
      </button>
    </form>
  )
}
