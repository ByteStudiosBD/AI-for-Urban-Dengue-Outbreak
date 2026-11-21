import { Info } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PrimaryTabs } from '@/components/risk/PrimaryTabs'
import { RecordsTable } from '@/components/risk/RecordsTable'
import { Card } from '@/components/ui/card'
import { useI18n } from '@/i18n'
import { useMetadata } from '@/state/AppData'

/** The complete original dataset as a table. `?dward=` (set by the ward panel) pre-filters to one ward. */
export default function ViewData() {
  const { t, fmtNum, fmtDate } = useI18n()
  const { meta } = useMetadata()
  const [params] = useSearchParams()
  const dward = params.get('dward') ?? ''
  const wardInfo = meta?.wards.find((w) => w.ward_id === dward)

  return (
    <div className="flex flex-col gap-5">
      <PrimaryTabs />
      {meta && (
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">{t('data.title')}</h2>
          <p className="text-xs text-muted">
            {t('data.subtitle', {
              rows: fmtNum(meta.coverage.rows, 0), wards: meta.coverage.ward_count,
              from: fmtDate(meta.coverage.date_min, 'long'), to: fmtDate(meta.coverage.date_max, 'long'),
            })}
          </p>
          <p className="mt-1 flex items-start gap-2 text-[11px] text-faint"><Info className="mt-px size-3.5 shrink-0" />{t('data.note')}</p>
        </div>
      )}
      <Card interactive={false} className="p-4">
        <RecordsTable key={dward} initialCity={wardInfo?.city} initialWard={wardInfo?.ward_id} />
      </Card>
    </div>
  )
}
