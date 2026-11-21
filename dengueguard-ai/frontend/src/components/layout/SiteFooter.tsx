import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Public repository of this project (from `git remote get-url origin`). */
export const REPO_URL = 'https://github.com/ByteStudiosBD/AI-for-Urban-Dengue-Outbreak'

/**
 * Site-wide footer: warm cream band with an accent top border, project credit on the left,
 * repository link and copyright on the right. In normal document flow (never fixed/sticky);
 * page layouts push it to the bottom on short pages.
 */
export function SiteFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`border-t-[3px] border-accent bg-[#FBF6EA] text-[#2a2620] ${className}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="min-w-0">
          <p className="text-lg font-bold tracking-[-0.01em] text-[#C2410C]">DengueGuard AI</p>
          <p className="mt-0.5 text-sm text-[#3d372e]">Developed by Byte Studios, EDU AI Engineering Hackathon 2026</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Button asChild variant="primary" size="sm" className="focus-visible:ring-2 focus-visible:ring-[#2a2620] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBF6EA]">
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub Repo (opens in a new tab)">
              GitHub Repo <ExternalLink aria-hidden />
            </a>
          </Button>
          <p className="text-xs text-[#5f574b]">© 2026 Byte Studios. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
