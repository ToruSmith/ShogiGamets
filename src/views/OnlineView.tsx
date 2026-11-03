import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader.tsx';
import { Button } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';
import { Input } from '../components/ui/input.tsx';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.tsx';
import { Switch } from '../components/ui/switch.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import type { HandicapId } from '../core/handicap.ts';
import { HANDICAPS } from '../core/handicap.ts';
import type { MessageKey } from '../i18n/index.ts';
import { useT } from '../i18n/index.ts';
import { onlineAvailable, roomBackend } from '../online/index.ts';
import { listLobby, normaliseRoomCode } from '../online/session.ts';
import type { LobbyRoom, Seat } from '../online/types.ts';
import { navigate } from '../router.ts';
import { currentMatch, setCurrentMatch } from '../state/current.ts';
import { OnlineMatch } from '../state/match.ts';
import { presetById, presetOf, TIME_PRESETS } from '../state/presets.ts';
import { settingsStore, updateSettings } from '../state/settings.ts';
import { useStore } from '../state/store.ts';
import { PlayView } from './PlayView.tsx';

const cleanName = (name: string): string => name.trim().slice(0, 16);

export function OnlineView() {
  const t = useT();
  const settings = useStore(settingsStore);
  const [name, setName] = useState(settings.playerName);
  const [handicap, setHandicap] = useState<HandicapId>('even');
  const [time, setTime] = useState('10m30s');
  const [seat, setSeat] = useState<'sente' | 'gote' | 'random'>('random');
  const [isPublic, setPublic] = useState(true);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lobby, setLobby] = useState<LobbyRoom[] | null>(null);

  const refresh = useCallback(async () => {
    if (!onlineAvailable) return;
    try {
      setLobby(await listLobby(await roomBackend()));
    } catch (problem) {
      setError(t('online.failed', { message: (problem as Error).message }));
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const playerName = cleanName(name) || 'Guest';

  async function create() {
    setBusy(true);
    setError(null);
    updateSettings({ playerName });
    try {
      const match = new OnlineMatch(await roomBackend());
      const chosen: Seat = seat === 'random' ? (Math.random() < 0.5 ? 'sente' : 'gote') : seat;
      const control = presetById(time).control;
      const roomCode = await match.session.create(
        { handicap, ...control, public: isPublic },
        playerName,
        chosen,
      );
      setCurrentMatch(match);
      navigate(`r/${roomCode}`);
    } catch (problem) {
      setError(t('online.failed', { message: (problem as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  function join(target: string) {
    const normalised = normaliseRoomCode(target);
    if (!normalised) {
      setError(t('online.badCode'));
      return;
    }
    updateSettings({ playerName });
    navigate(`r/${normalised}`);
  }

  if (!onlineAvailable) {
    return (
      <div className="min-h-dvh">
        <PageHeader title={t('online.title')} kanji="通信" />
        <p
          className="gutter mx-auto max-w-2xl py-10 text-muted-foreground"
          data-testid="online-unavailable"
        >
          {t('online.unavailable')}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <PageHeader title={t('online.title')} kanji="通信" />
      <main className="gutter mx-auto grid max-w-5xl grid-cols-1 gap-6 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t('online.name')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Input
              id="online-name"
              data-testid="online-name"
              value={name}
              maxLength={16}
              placeholder={t('online.namePlaceholder')}
              onChange={(event) => setName(event.target.value)}
            />
            <Tabs defaultValue="create">
              <TabsList>
                <TabsTrigger value="create">{t('online.create')}</TabsTrigger>
                <TabsTrigger value="join">{t('online.join')}</TabsTrigger>
              </TabsList>
              <TabsContent value="create" className="flex flex-col gap-4 pt-2">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="online-handicap" className="text-sm font-medium">
                      {t('setup.handicap')}
                    </label>
                    <Select
                      value={handicap}
                      onValueChange={(value) => setHandicap(value as HandicapId)}
                    >
                      <SelectTrigger id="online-handicap">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HANDICAPS.map((entry) => (
                          <SelectItem key={entry.id} value={entry.id}>
                            {t(`handicap.${entry.id}` as MessageKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="online-time" className="text-sm font-medium">
                      {t('setup.time')}
                    </label>
                    <Select value={time} onValueChange={setTime}>
                      <SelectTrigger id="online-time">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_PRESETS.map((preset) => (
                          <SelectItem key={preset.id} value={preset.id}>
                            {t(preset.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">{t('online.seat')}</legend>
                  <RadioGroup value={seat} onValueChange={(value) => setSeat(value as typeof seat)}>
                    <RadioGroupItem value="sente" id="seat-sente">
                      ☗ {t(handicap === 'even' ? 'common.sente' : 'common.shitate')}
                    </RadioGroupItem>
                    <RadioGroupItem value="gote" id="seat-gote">
                      ☖ {t(handicap === 'even' ? 'common.gote' : 'common.uwate')}
                    </RadioGroupItem>
                    <RadioGroupItem value="random" id="seat-random">
                      {t('common.random')}
                    </RadioGroupItem>
                  </RadioGroup>
                </fieldset>
                <label
                  htmlFor="online-public"
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  {t('online.public')}
                  <Switch id="online-public" checked={isPublic} onCheckedChange={setPublic} />
                </label>
                <Button onClick={create} disabled={busy} data-testid="create-room">
                  {t('online.create')}
                </Button>
              </TabsContent>
              <TabsContent value="join" className="flex flex-col gap-3 pt-2">
                <label htmlFor="online-code" className="text-sm font-medium">
                  {t('online.code')}
                </label>
                <Input
                  id="online-code"
                  data-testid="room-code-input"
                  value={code}
                  placeholder={t('online.codePlaceholder')}
                  onChange={(event) => setCode(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && join(code)}
                  className="font-mono tracking-widest uppercase"
                />
                <Button onClick={() => join(code)} data-testid="join-room">
                  {t('online.join')}
                </Button>
              </TabsContent>
            </Tabs>
            {error && (
              <p className="text-sm text-shu" role="alert">
                {error}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="grid-cols-[1fr_auto]">
            <div>
              <CardTitle>{t('online.lobby')}</CardTitle>
              <CardDescription>{t('home.online.desc')}</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('online.refresh')}
              onClick={() => void refresh()}
            >
              <RefreshCw />
            </Button>
          </CardHeader>
          <CardContent>
            {lobby === null ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : lobby.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('online.lobbyEmpty')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border" data-testid="lobby">
                {lobby.map((room) => {
                  const preset = presetOf(room.config);
                  return (
                    <li key={room.code} className="flex items-center gap-3 py-2.5">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">
                          {room.hostSeat === 'sente' ? '☗' : '☖'} {room.host}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {t(`handicap.${room.config.handicap}` as MessageKey)}
                          {preset && ` · ${t(preset.label)}`}
                        </span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => join(room.code)}>
                        {t('online.join')}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

/** #/r/CODE：自己開的房間直接進入；別人的邀請連結則加入 */
export function RoomRoute({ code }: { code: string }) {
  const t = useT();
  const match = useStore(currentMatch);
  const settings = useStore(settingsStore);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(settings.playerName);
  const normalised = normaliseRoomCode(code);
  const online = match instanceof OnlineMatch ? match : null;
  const inRoom =
    Boolean(online && online.session.view?.code === normalised) ||
    Boolean(online && !online.session.view);

  async function join(playerName: string) {
    if (!normalised) return;
    setError(null);
    try {
      const match = new OnlineMatch(await roomBackend());
      const problem = await match.session.join(normalised, playerName);
      if (problem) {
        match.dispose();
        setError(t('online.notFound'));
        return;
      }
      setCurrentMatch(match);
    } catch (problem) {
      setError(t('online.failed', { message: (problem as Error).message }));
    }
  }

  useEffect(() => {
    if (!inRoom && settings.playerName && normalised && !error) void join(settings.playerName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalised]);

  if (!onlineAvailable || !normalised) {
    return (
      <div className="min-h-dvh">
        <PageHeader title={t('online.title')} kanji="通信" back="online" />
        <p className="gutter mx-auto max-w-2xl py-10 text-muted-foreground">
          {onlineAvailable ? t('online.badCode') : t('online.unavailable')}
        </p>
      </div>
    );
  }

  if (inRoom && online) return <OnlineRoom match={online} code={normalised} />;

  return (
    <div className="min-h-dvh">
      <PageHeader title={`${t('online.title')} · ${normalised}`} kanji="通信" back="online" />
      <main className="gutter mx-auto flex max-w-sm flex-col gap-3 py-10">
        {error ? (
          <p className="text-shu" role="alert">
            {error}
          </p>
        ) : settings.playerName ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <>
            <label htmlFor="join-name" className="text-sm font-medium">
              {t('online.name')}
            </label>
            <Input
              id="join-name"
              data-testid="join-name"
              value={name}
              maxLength={16}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              data-testid="join-confirm"
              onClick={() => {
                const playerName = cleanName(name) || 'Guest';
                updateSettings({ playerName });
                void join(playerName);
              }}
            >
              {t('online.join')}
            </Button>
          </>
        )}
      </main>
    </div>
  );
}

/**
 * 房間內：再戰會換到新房間，網址跟著更新。
 * 離開房間畫面（回大廳、回首頁）時結束連線：還沒有對手的房間會被刪掉，否則標記離線。
 */
function OnlineRoom({ match, code }: { match: OnlineMatch; code: string }) {
  const snapshot = useStore(match.store);
  const roomCode = snapshot.online?.code;
  const mounted = useRef(false);
  useEffect(() => {
    if (roomCode && roomCode !== code) navigate(`r/${roomCode}`);
  }, [roomCode, code]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // 延後一拍：開發模式的 StrictMode 會立刻重新掛載，那時不該結束連線
      setTimeout(() => {
        if (!mounted.current && currentMatch.get() === match) setCurrentMatch(null);
      }, 0);
    };
  }, [match]);
  return <PlayView controller={match} />;
}
