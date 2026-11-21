import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

export default function NotFound() {
  const { t } = useI18n()
  return (
    <div className="grid place-items-center gap-4 py-24 text-center">
      <p className="text-lg font-semibold">{t('notFound.title')}</p>
      <Button asChild variant="primary"><Link to="/risk">{t('notFound.back')}</Link></Button>
    </div>
  )
}
