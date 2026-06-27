import { useState, type CSSProperties } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/common/Spinner'
import logo from '@/assets/logo.svg'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuthStore()
  const [serverError, setServerError] = useState('')
  const [remember, setRemember] = useState(true)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (isAuthenticated) return <Navigate to="/" replace />

  const onSubmit = async (values: FormValues) => {
    setServerError('')
    try {
      await login(values.email, values.password, remember)
      navigate('/')
    } catch (err: any) {
      setServerError(err?.response?.data?.message || t('auth.loginError'))
    }
  }

  return (
    <div className="sun-glow relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Animated brand backdrop — drifting, blurred colour blobs. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="animate-blob absolute -left-24 -top-24 size-[28rem] rounded-full bg-medium-purple/30 blur-3xl"
          style={{ '--bx': '60px', '--by': '40px' } as CSSProperties}
        />
        <div
          className="animate-blob absolute -right-32 top-1/4 size-[32rem] rounded-full bg-orange/20 blur-3xl"
          style={{ '--bx': '-50px', '--by': '60px', animationDelay: '-6s' } as CSSProperties}
        />
        <div
          className="animate-blob absolute -bottom-32 left-1/3 size-[30rem] rounded-full bg-green/20 blur-3xl"
          style={{ '--bx': '40px', '--by': '-50px', animationDelay: '-12s' } as CSSProperties}
        />
        <div
          className="animate-blob absolute bottom-1/4 right-1/4 size-72 rounded-full bg-yellow/20 blur-3xl"
          style={{ '--bx': '-30px', '--by': '-30px', animationDelay: '-3s' } as CSSProperties}
        />
      </div>

      <div className="card reveal relative z-10 w-full max-w-md p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={logo} alt="Chargee" className="mb-5 h-9" />
          <h1 className="text-28 font-extrabold text-dark-blue">{t('auth.loginTitle')}</h1>
          <p className="mt-2 text-sm text-text-gray">{t('auth.loginSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">
              {t('auth.email')}
            </label>
            <input id="email" type="email" autoComplete="email" className="input" {...register('email')} />
            {errors.email && <p className="mt-1 text-13 text-red">{errors.email.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="password">
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              {...register('password')}
            />
            {errors.password && <p className="mt-1 text-13 text-red">{errors.password.message}</p>}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-13 text-text-gray">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 rounded border-beige-2 text-dark-purple focus:ring-dark-purple"
            />
            {t('auth.rememberMe')}
          </label>

          {serverError && (
            <p className="rounded-xl bg-red/10 px-3 py-2 text-13 text-red">{serverError}</p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? <Spinner className="size-4 border-beige border-t-white" /> : null}
            {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>

        <div className="mt-6 space-y-3 border-t border-beige-2 pt-5 text-13 leading-160 text-text-gray">
          <p>
            {t('auth.credentialsNote')}{' '}
            <a
              href="mailto:support@chargee.energy"
              className="font-semibold text-dark-purple hover:underline"
            >
              support@chargee.energy
            </a>
            .
          </p>
          <p className="rounded-xl bg-light-purple-3 px-3 py-2 text-dark-blue">
            {t('auth.notProductionNote')}
          </p>
        </div>
      </div>
    </div>
  )
}
