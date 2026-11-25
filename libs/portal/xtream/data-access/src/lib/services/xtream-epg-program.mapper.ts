import type { EpgItem, EpgProgram } from '@iptvnator/shared/interfaces';

export function mapEpgProgramToEpgItem(
    program: EpgProgram,
    channelId: string
): EpgItem {
    const startMs = program.startTimestamp
        ? program.startTimestamp * 1000
        : Date.parse(program.start);
    const stopMs = program.stopTimestamp
        ? program.stopTimestamp * 1000
        : Date.parse(program.stop);
    const startTimestamp = Number.isFinite(startMs)
        ? Math.floor(startMs / 1000)
        : 0;
    const stopTimestamp = Number.isFinite(stopMs)
        ? Math.floor(stopMs / 1000)
        : 0;

    return {
        id: `${channelId}|${program.start}`,
        epg_id: '',
        title: program.title ?? '',
        lang: '',
        start: program.start,
        end: program.stop,
        stop: program.stop,
        description: program.desc ?? '',
        channel_id: channelId,
        start_timestamp: String(startTimestamp),
        stop_timestamp: String(stopTimestamp),
    };
}
