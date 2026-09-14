type ServerPromoter = (sourceId: string | undefined, url: string) => void;

let promoter: ServerPromoter | null = null;

export function registerXtreamServerPromoter(next: ServerPromoter): void {
  promoter = next;
}

export function promoteXtreamServer(sourceId: string | undefined, url: string): void {
  promoter?.(sourceId, url);
}
