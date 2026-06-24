import { useState } from 'react'
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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (isAuthenticated) return <Navigate to="/" replace />

  const onSubmit = async (values: FormValues) => {
    setServerError('')
    try {
      await login(values.email, values.password)
      navigate('/')
    } catch (err: any) {
      setServerError(err?.response?.data?.message || t('auth.loginError'))
    }
  }

  return (
    <div className="sun-glow flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md p-8">
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

          {serverError && (
            <p className="rounded-xl bg-red/10 px-3 py-2 text-13 text-red">{serverError}</p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? <Spinner className="size-4 border-beige border-t-white" /> : null}
            {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>
      </div>
    </div>
  )
}
