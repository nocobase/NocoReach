const en = {
  indicator: 'Demo data',
  indicatorBody: 'This project uses demo data.',
  indicatorDisabled: 'Demo environment; simulation is paused for this project.',
  unknown: 'Simulation status could not be verified',
  retry: 'Retry',
};
const zh = {
  indicator: '演示数据',
  indicatorBody: '当前项目使用演示数据。',
  indicatorDisabled: '演示环境，当前项目已暂停模拟。',
  unknown: '无法确认模拟状态',
  retry: '重试',
};

const translations: Record<string, typeof en> = {
  ko: {
    indicator: '데모 데이터',
    indicatorBody: '이 프로젝트는 데모 데이터를 사용합니다.',
    indicatorDisabled:
      '데모 환경입니다. 이 프로젝트의 시뮬레이션은 일시 중지되었습니다.',
    unknown: '시뮬레이션 상태를 확인할 수 없습니다',
    retry: '다시 시도',
  },
  ru: {
    indicator: 'Демоданные',
    indicatorBody: 'В этом проекте используются демонстрационные данные.',
    indicatorDisabled:
      'Демонстрационная среда. Симуляция для этого проекта приостановлена.',
    unknown: 'Не удалось проверить состояние симуляции',
    retry: 'Повторить',
  },
  'zh-hant': {
    indicator: '示範資料',
    indicatorBody: '此專案使用示範資料。',
    indicatorDisabled: '示範環境；此專案已暫停模擬。',
    unknown: '無法確認模擬狀態',
    retry: '重試',
  },
  ja: {
    indicator: 'デモデータ',
    indicatorBody: 'このプロジェクトはデモデータを使用しています。',
    indicatorDisabled:
      'デモ環境です。このプロジェクトのシミュレーションは一時停止中です。',
    unknown: 'シミュレーションの状態を確認できませんでした',
    retry: '再試行',
  },
  es: {
    indicator: 'Datos de demostración',
    indicatorBody: 'Este proyecto utiliza datos de demostración.',
    indicatorDisabled:
      'Entorno de demostración; la simulación está en pausa en este proyecto.',
    unknown: 'No se ha podido comprobar el estado de la simulación',
    retry: 'Reintentar',
  },
  pt: {
    indicator: 'Dados de demonstração',
    indicatorBody: 'Este projeto usa dados de demonstração.',
    indicatorDisabled:
      'Ambiente de demonstração; a simulação está pausada neste projeto.',
    unknown: 'Não foi possível verificar o status da simulação',
    retry: 'Tentar novamente',
  },
  fr: {
    indicator: 'Données de démonstration',
    indicatorBody: 'Ce projet utilise des données de démonstration.',
    indicatorDisabled:
      'Environnement de démonstration ; la simulation est en pause pour ce projet.',
    unknown: 'Impossible de vérifier l’état de la simulation',
    retry: 'Réessayer',
  },
  de: {
    indicator: 'Demodaten',
    indicatorBody: 'Dieses Projekt verwendet Demodaten.',
    indicatorDisabled:
      'Demoumgebung; die Simulation ist für dieses Projekt pausiert.',
    unknown: 'Der Simulationsstatus konnte nicht überprüft werden',
    retry: 'Erneut versuchen',
  },
  vi: {
    indicator: 'Dữ liệu minh họa',
    indicatorBody: 'Dự án này sử dụng dữ liệu minh họa.',
    indicatorDisabled:
      'Môi trường minh họa; tính năng mô phỏng của dự án này đang tạm dừng.',
    unknown: 'Không thể xác minh trạng thái mô phỏng',
    retry: 'Thử lại',
  },
  id: {
    indicator: 'Data demo',
    indicatorBody: 'Proyek ini menggunakan data demo.',
    indicatorDisabled: 'Lingkungan demo; simulasi dijeda untuk proyek ini.',
    unknown: 'Status simulasi tidak dapat diverifikasi',
    retry: 'Coba lagi',
  },
};

export const indicatorCopy = (locale: string): typeof en => {
  const tag = locale.toLowerCase().replaceAll('_', '-');
  if (/^zh-(?:tw|hk|mo|hant)(?:-|$)/.test(tag)) return translations['zh-hant'];
  return tag.startsWith('zh') ? zh : (translations[tag.split('-')[0]] ?? en);
};
