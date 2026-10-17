import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { defaultGlassTheme, LiquiGlass, LiquiThemeProvider } from '@liqui-design/glass'
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Code2,
  ChevronLeft,
  Box,
  ChevronDown,
  CircleHelp,
  Compass,
  ChevronRight,
  Crown,
  FolderOpen,
  Gamepad2,
  HardDrive,
  LayoutGrid,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import type { InstanceRecord, InstallProgress, LauncherSettings, MinecraftVersion, ModrinthProject, ModrinthProjectDetails, VerificationBadge as VerificationBadgeType } from './types'

type Page = 'home' | 'instances' | 'discover' | 'community' | 'settings' | 'profile'
type ProjectType = 'modpack' | 'mod' | 'resourcepack' | 'shader'
type InstanceInput = Pick<InstanceRecord, 'name' | 'minecraftVersion' | 'loader'> & Partial<Pick<InstanceRecord, 'kind' | 'sourceProjectId'>>

let activeLanguage: LauncherSettings['launcherLanguage'] = 'ru'

const englishTranslations: Record<string, string> = {
  'Главная': 'Home', 'Сборки': 'Instances', 'Каталог': 'Discover', 'Сообщество': 'Community', 'Настройки': 'Settings', 'Профиль игрока': 'Player profile',
  'Сохранено!': 'Saved!', 'Не удалось сохранить настройки.': 'Could not save settings.', 'Не удалось создать сборку.': 'Could not create instance.',
  'Сборка добавлена в избранное.': 'Instance added to favorites.', 'Сборка удалена из избранного.': 'Instance removed from favorites.',
  'Не удалось обновить сборку.': 'Could not update instance.', 'Удалить все файлы этой сборки с диска? Она останется в библиотеке, но для игры её придётся установить заново.': 'Delete all files for this instance? It will remain in your library, but you will need to reinstall it to play.',
  'Файлы сборки удалены. Профиль остался в библиотеке.': 'Instance files deleted. The profile remains in your library.', 'Не удалось удалить файлы сборки.': 'Could not delete instance files.',
  'Не удалось удалить сборку.': 'Could not delete instance.', 'Открыть профиль игрока': 'Open player profile', 'Аккаунты и вход': 'Accounts and sign-in',
  'Информация о приложении': 'About the app', 'Десктопный лаунчер NEXIUM. Каталог загружает реальные проекты Modrinth.': 'NEXIUM desktop launcher. The catalog loads real Modrinth projects.',
  'Открыть папку NEXIUM': 'Open NEXIUM folder', 'Не удалось скачать проект.': 'Could not download project.', 'Закрыть': 'Close', 'Выбрать': 'Select',
  'NEXIUM · ОФИЦИАЛЬНЫЕ КАНАЛЫ': 'NEXIUM · OFFICIAL CHANNELS', 'Твой мир начинается здесь': 'Your world starts here', 'Новости проекта, обновления и новые возможности лаунчера.': 'Project news, updates, and new launcher features.',
  'Открыть сайт NEXIUM': 'Visit the NEXIUM website', 'РЕКОМЕНДАЦИЯ СБОРКИ': 'FEATURED MODPACK', 'Большое приключение с исследованием, магией и технологиями.': 'A grand adventure with exploration, magic, and technology.',
  'Посмотреть': 'View', 'Уютное приключение: исследуй мир, выполняй задания и создай свой дом.': 'A cozy adventure: explore the world, complete quests, and build a home.',
  'Игровой никнейм': 'Player name', 'Изменить игровой никнейм': 'Change player name', 'Выбор сборки или версии Minecraft': 'Select a modpack or Minecraft version',
  'ещё не запускалась': 'not launched yet', 'Выбери сборку или версию Minecraft': 'Choose a modpack or Minecraft version', 'Загружаем версии Minecraft…': 'Loading Minecraft versions…',
  'Запуск игры пока не подключён.': 'Launching the game is not available yet.', 'Установка игры пока не подключена; файлы не загружены.': 'Game installation is not available yet; no files were downloaded.',
  'Играть': 'Play', 'Установить': 'Install', 'карусель': 'carousel', 'Предыдущий баннер': 'Previous banner', 'Следующий баннер': 'Next banner',
  'Установлена': 'Installed', 'Переустановить': 'Reinstall', 'Не установлена': 'Not installed', 'Файлы не установлены': 'Files not installed', 'Убрать из избранного': 'Remove from favorites', 'В избранное': 'Add to favorites',
  'Подготовка установки…': 'Preparing installation…', 'Скачивание': 'Downloading', 'Проверка файлов…': 'Verifying files…', 'осталось': 'left',
  'Переименовать': 'Rename', 'Открыть папку сборки': 'Open instance folder', 'Удалить файлы, оставить профиль': 'Delete files, keep profile', 'Удалить сборку и папку': 'Delete instance and folder',
  'Моды': 'Mods', 'Ресурспаки': 'Resource packs', 'Шейдеры': 'Shaders', 'Не удалось загрузить каталог.': 'Could not load the catalog.', 'Не удалось открыть сборку.': 'Could not open the modpack.',
  'Исследование и приключения': 'Adventure', 'Сложные': 'Challenging', 'Сражения': 'Combat', 'Сборники': 'Kitchen sink', 'Лёгкие': 'Lightweight', 'Магия': 'Magic',
  'Мультиплеер': 'Multiplayer', 'Оптимизация': 'Optimization', 'Квесты': 'Quests', 'Технологии': 'Technology', 'Приключения': 'Adventure', 'Декор': 'Decoration',
  'Снаряжение': 'Equipment', 'Еда': 'Food', 'Мобы': 'Mobs', 'Хранилища': 'Storage', 'Утилиты': 'Utility', 'Генерация мира': 'World generation',
  'Реалистичные': 'Realistic', 'Минималистичные': 'Simplistic', 'Тематические': 'Themed', 'В стиле Minecraft': 'Vanilla-like', 'Фэнтези': 'Fantasy',
  'Полуреалистичные': 'Semi-realistic', 'Для скриншотов': 'Screenshot', 'Любая версия': 'Any version', 'Релевантность': 'Relevance', 'Загрузки': 'Downloads',
  'Популярность': 'Popularity', 'Дата обновления': 'Recently updated', 'Что ищем?': 'Search projects…', 'Источник каталога': 'Catalog source',
  'Фильтр версии игры': 'Game version filter', 'Фильтр категории': 'Category filter', 'Любая категория': 'Any category', 'Сортировка каталога': 'Catalog sort',
  'Выбрать сборку для установки': 'Select an instance to install to', 'Загружаем…': 'Loading…', 'Загрузить ещё': 'Load more',
  'Не удалось загрузить проект.': 'Could not load the project.', 'Сначала создайте сборку и выберите её в каталоге.': 'Create an instance first and select it in the catalog.',
  'Скачивается…': 'Downloading…', 'Скачать': 'Download', 'Обзор': 'Overview', 'Картинки': 'Gallery', 'Версии': 'Versions',
  'Автор не добавил подробное описание.': 'The author has not added a description.', 'неизвестно': 'unknown', 'Разделы настроек': 'Settings sections',
  'Загружается…': 'Loading…', 'Модифицированные версии': 'Modded versions', 'Снапшоты': 'Snapshots', 'Релизы старше 1.5.2': 'Releases older than 1.5.2',
  'Бета-версии': 'Beta versions', 'Альфа-версии': 'Alpha versions', 'Выбор Java': 'Select Java', 'Автоматически': 'Automatic',
  'Выделенная память': 'Allocated memory', 'Язык Minecraft': 'Minecraft language', 'Русский': 'Russian', 'Консоль разработчика': 'Developer console',
  'Отключена': 'Disabled', 'Общая': 'Shared', 'Качество соединения': 'Connection quality', 'Хорошее': 'Good', 'Нормальное': 'Normal', 'Плохое': 'Poor',
  'После запуска игры': 'After starting the game', 'Скрывать лаунчер': 'Hide launcher', 'Закрывать лаунчер': 'Close launcher', 'Ничего не делать': 'Do nothing',
  'Язык': 'Language', 'Пользовательское видео выбрано': 'Custom video selected', 'Пользовательское изображение выбрано': 'Custom image selected', 'Фон fon.jpg': 'Background: fon.jpg',
  'Локальный профиль': 'Local profile', 'Проверьте никнейм и попробуйте снова.': 'Check the player name and try again.',
  'Запуск Minecraft сейчас отключён.': 'Minecraft launching is currently disabled.',
  'Сервис учётных записей NEXIUM ещё не создан.': 'NEXIUM account services are not available yet.', 'Расскажи немного о себе': 'Tell us a little about yourself',
  'Например, Выживание с друзьями': 'For example, Survival with friends', 'Версия Minecraft': 'Minecraft version', 'Загрузчик Minecraft': 'Minecraft loader',
  'сборка': 'instance', 'сборки': 'instances', 'сборок': 'instances',
  'Загрузка библиотеки…': 'Loading library…', 'MINECRAFT · NEXIUM': 'MINECRAFT · NEXIUM', 'Твоя игра.': 'Your game.', 'Твои миры.': 'Your worlds.',
  'Выбери версию или сборку и продолжай с того места, где остановился.': 'Choose a version or modpack and pick up where you left off.',
  'Сохранить': 'Save', 'Отмена': 'Cancel', 'Профиль': 'Profile', 'ВЕРСИЯ ИЛИ СБОРКА': 'VERSION OR MODPACK',
  'Создать сборку': 'Create instance', 'Сайт NEXIUM': 'NEXIUM website', 'Telegram': 'Telegram', 'ИГРОВАЯ БИБЛИОТЕКА': 'GAME LIBRARY',
  'Недавние сборки': 'Recent instances', 'Все сборки': 'All instances', 'Здесь пока пусто': 'Nothing here yet',
  'Создай отдельную сборку для каждого мира или набора модов.': 'Create a separate instance for each world or modpack.', 'Создать первую': 'Create your first',
  ' · файлы не установлены': ' · files not installed', 'все сборки': 'all instances', 'ТВОЯ БИБЛИОТЕКА': 'YOUR LIBRARY',
  'Отдельные профили и папки для каждого способа играть.': 'Separate profiles and folders for every way you play.',
  'Нет сборок': 'No instances yet', 'Создай первую, чтобы начать организовывать Minecraft.': 'Create your first instance to organize your Minecraft setup.',
  'Новая сборка': 'New instance', 'Minecraft': 'Minecraft', 'Контент': 'Content', 'MODRINTH · ЖИВОЙ КАТАЛОГ': 'MODRINTH · LIVE CATALOG',
  'Найди своё следующее': 'Find your next adventure', 'Ищи модпаки, моды и ресурсы. Данные загружаются напрямую из Modrinth.': 'Browse modpacks, mods, and resources. Data loads directly from Modrinth.',
  'Найти': 'Search', 'Источник': 'Source', 'Версия': 'Version', 'Категория': 'Category', 'Сортировка': 'Sort',
  'Установить в сборку': 'Install to instance', 'Загружаем проекты Modrinth…': 'Loading Modrinth projects…', 'Повторить': 'Retry',
  'от': 'by', 'Проекты не найдены. Попробуй другой запрос.': 'No projects found. Try another search.', 'из': 'of', 'Обновляем каталог…': 'Refreshing catalog…',
  'ПРОЕКТ MODRINTH': 'MODRINTH PROJECT', 'загрузок': 'downloads', 'версий': 'versions', 'Обновлено': 'Updated', 'Нет подходящей версии для Minecraft': 'No compatible version for Minecraft',
  'Загружаем информацию о проекте…': 'Loading project details…', 'Автор не добавил изображения.': 'The author has not added images.',
  'Обязательные зависимости:': 'Required dependencies:', 'Версии не найдены.': 'No versions found.', 'КОНФИГУРАЦИЯ': 'CONFIGURATION',
  'Параметры игры, поведения лаунчера и оформления.': 'Game, launcher, and appearance settings.', 'Запуск Minecraft': 'Minecraft',
  'Настройки лаунчера': 'Launcher settings', 'Внешний вид': 'Appearance', 'Игровая директория': 'Game directory', 'Launcher': 'Launcher',
  'Изменить': 'Change', 'Список версий': 'Version list', 'Java и память': 'Java and memory', 'Параметры виртуальной машины для Minecraft': 'Minecraft virtual machine settings',
  'Java': 'Java', 'Выделенная память, МБ (доступно до': 'Allocated memory, MB (up to', 'МБ': 'MB',
  'Рекомендованно:': 'Recommended:', 'Макс.': 'Max', 'Использовать язык лаунчера в Minecraft': 'Use launcher language in Minecraft',
  'Аргументы Minecraft': 'Minecraft arguments', 'Дополнительные JVM-аргументы запуска': 'Additional JVM launch arguments',
  'Поведение и подключение': 'Behavior and connection', 'Язык интерфейса': 'Interface language', 'Liquid Glass': 'Liquid Glass',
  'Один ползунок плотности материала, как в прежнем варианте': 'Adjust the glass material strength.', 'Прозрачность стекла': 'Glass opacity',
  'Фон приложения': 'App background', 'Свой фон масштабируется под окно лаунчера': 'Custom background scales to the launcher window',
  'Выбрать файл': 'Choose file', 'Изображение или MP4-видео длительностью до 5 секунд.': 'Image or MP4 video up to 5 seconds long.',
  'Отменить': 'Discard', 'АККАУНТЫ И ИГРОК': 'ACCOUNTS & PLAYER', 'Никнейм и вход': 'Player name & sign-in',
  'Игровой никнейм (3–16 символов A–Z, 0–9, _)': 'Player name (3–16 characters: A–Z, 0–9, _)',
  'Войти с NEXIUM': 'Sign in with NEXIUM', 'ЛИЧНАЯ СТРАНИЦА': 'PLAYER PROFILE', 'Назад': 'Back', 'Игровой ник:': 'Player name:',
  '· локальный профиль': '· local profile', 'Изменить аватар': 'Change avatar', 'О СЕБЕ': 'ABOUT ME', 'Настрой свою страницу': 'Edit your profile',
  'Визуальный никнейм': 'Display name', 'Био': 'Bio', 'До 280 символов': 'Up to 280 characters', 'Сохранить профиль': 'Save profile',
  'БИБЛИОТЕКА': 'LIBRARY', 'Название сборки': 'Instance name', 'НОВАЯ ИГРОВАЯ ПАПКА': 'NEW GAME FOLDER',
  'Название': 'Name', 'Загрузчик': 'Loader', 'Создать папку': 'Create folder',
  'Игровой ник: {name}': 'Player name: {name}',
  'Официальные каналы NEXIUM': 'Official NEXIUM channels',
  'Новости проекта, обновления лаунчера и общение с сообществом.': 'Project news, launcher updates, and community chat.',
  'Новости, обновления и информация о лаунчере.': 'Launcher news, updates, and information.',
  'Присоединяйся к сообществу NEXIUM в Telegram.': 'Join the NEXIUM community on Telegram.',
  'Запустить сборку': 'Play instance',
  'Значки профиля': 'Profile badges',
  'Значки выдаются администрацией NEXIUM после проверки.': 'Badges are awarded by NEXIUM staff after review.',
  'Доверенный автор': 'Trusted Creator',
  'Проверяет и публикует проверенные сборки без вредоносных файлов.': 'Reviews and publishes modpacks verified to be free of malware.',
  'Разработчик': 'Developer',
  'Создаёт моды, плагины, клиенты или сам лаунчер.': 'Creates mods, plugins, clients, or the launcher.',
  'Официальный представитель': 'Official / Staff',
  'Администрация лаунчера и официальные партнёры.': 'Launcher staff and official partners.',
  'Пока значков нет': 'No badges yet',
  'ПРОВЕРКА': 'VERIFICATION',
  'Статистика профиля': 'Profile statistics',
  'Разделы профиля': 'Profile sections',
  'Просмотры': 'Views',
  'Комментарии': 'Comments',
  'Лайки': 'Likes',
  'Подписчики': 'Followers',
  'Подписки': 'Following',
  'Просмотренное': 'Viewed',
  'Мои комментарии': 'My comments',
  'Мои лайки': 'My likes',
  'Мои подписчики': 'My followers',
  'Мои подписки': 'Following',
  'Мои сборки': 'My modpacks',
  'В сообществе пока нет данных для этого раздела.': 'There is no community data for this section yet.',
  'Счётчики появятся после подключения аккаунта сообщества.': 'Stats will appear after connecting a community account.',
  'СБОРКИ ИГРОКОВ': 'PLAYER MODPACKS',
  'Каталог пользовательских сборок': 'Community modpacks',
  'Сборки проходят модерацию перед публикацией. Одобренные проекты будут доступны здесь.': 'Modpacks are reviewed before publication. Approved projects will be listed here.',
  'Предложить сборку на модерацию': 'Submit a modpack for review',
  'Отправка сборок станет доступна после подключения сервера сообщества.': 'Modpack submissions will be available when the community server is connected.',
  'Каталог пока пуст': 'The catalog is empty',
  'Одобренные модерацией сборки появятся здесь.': 'Modpacks approved by moderators will appear here.',
  'СООБЩЕСТВО': 'COMMUNITY',
  'МОДЕРАЦИЯ': 'MODERATION',
  'Опубликованные сборки': 'Published modpacks',
  'Просмотренная активность': 'Viewing history',
  'Интеракции': 'Interactions',
  'Аккаунт сообщества': 'Community account',
  '· файлы не установлены': '· files not installed', 'МБ)': 'MB)',
  'ГБ': 'GB', 'Не удалось загрузить версии Minecraft: {error}': 'Could not load Minecraft versions: {error}',
  '«{name}» добавлена. Игровые файлы пока не установлены.': '“{name}” was added. Game files are not installed yet.',
  'Сборка переименована: {name}': 'Instance renamed: {name}',
  'Удалить «{name}» вместе со всей её папкой? Это действие нельзя отменить.': 'Delete “{name}” and its entire folder? This action cannot be undone.',
  'Сборка «{name}» удалена.': 'Instance “{name}” was deleted.',
  'Файлы сохранены в выбранную сборку ({count}).': 'Files saved to the selected instance ({count}).',
  'запуск {date}': 'Last played {date}', 'Слайд {number}': 'Slide {number}',
  'Для {version} {loader} нет совместимой версии проекта.': 'No compatible project version is available for {version} {loader}.',
  'Проект {title}': 'Project {title}',
  'Название сборки нельзя использовать как имя папки Windows.': 'The instance name cannot be used as a Windows folder name.',
  'Не удалось загрузить версии Minecraft ({status}).': 'Could not load Minecraft versions ({status}).',
  'Ник должен содержать 3–16 латинских букв, цифр или знаков подчёркивания.': 'Player name must be 3–16 characters using Latin letters, digits, or underscores.',
  'Папка игровых данных Minecraft': 'Minecraft game data folder',
  'Укажите имя сборки длиной до 40 символов.': 'Enter an instance name up to 40 characters long.',
  'Сборка не найдена.': 'Instance not found.',
  'Название сборки должно содержать от 1 до 40 символов.': 'Instance name must be 1–40 characters long.',
  'Выберите javaw.exe или java.exe': 'Select javaw.exe or java.exe',
  'Выберите изображение для фона': 'Choose a background image',
  'Изображения и короткие видео': 'Images and short videos',
  'Размер видеофона не должен превышать 100 МБ.': 'Background video must not exceed 100 MB.',
  'Не удалось прочитать длительность MP4-видео.': 'Could not read the MP4 video duration.',
  'Длительность видеофона должна быть не больше 5 секунд.': 'Background video must be no longer than 5 seconds.',
  'Разрешены только официальные ссылки NEXIUM.': 'Only official NEXIUM links are allowed.',
  'Выберите аватар профиля': 'Choose a profile avatar',
  'Изображения': 'Images',
  'Некорректная категория проекта.': 'Invalid project category.',
  'Modrinth вернул ошибку {status}.': 'Modrinth returned an error ({status}).',
  'Некорректный идентификатор проекта Modrinth.': 'Invalid Modrinth project ID.',
  'Modrinth не смог загрузить проект ({status}).': 'Modrinth could not load the project ({status}).',
  'Modrinth не смог загрузить версии ({status}).': 'Modrinth could not load versions ({status}).',
  'Modrinth не смог загрузить автора проекта ({status}).': 'Modrinth could not load the project author ({status}).',
  'Участник Modrinth': 'Modrinth member',
  'Некорректный проект или версия Modrinth.': 'Invalid Modrinth project or version.',
  'Сначала выберите или создайте сборку.': 'Select or create an instance first.',
  'Тип проекта не подходит для выбранной папки сборки.': 'This project type is not compatible with the selected instance folder.',
  'Слишком много вложенных зависимостей.': 'Too many nested dependencies.',
  'Не удалось получить версию проекта ({status}).': 'Could not retrieve project version ({status}).',
  'Версия Modrinth не соответствует выбранному проекту.': 'The Modrinth version does not match the selected project.',
  'Версия проекта не поддерживает Minecraft {version}.': 'This project version does not support Minecraft {version}.',
  'Версия проекта не поддерживает загрузчик {loader}.': 'This project version does not support the {loader} loader.',
  'Моды нужно устанавливать в сборку с Fabric, Forge или другим загрузчиком.': 'Mods must be installed into an instance with Fabric, Forge, or another mod loader.',
  'Не удалось проверить обязательную зависимость ({status}).': 'Could not check required dependency ({status}).',
  'Не найдена совместимая обязательная зависимость {id}.': 'A compatible required dependency {id} was not found.',
  'У этой версии нет доступного файла для загрузки.': 'No downloadable file is available for this version.',
  'Файл превышает допустимый размер 2 ГБ.': 'The file exceeds the 2 GB size limit.',
  'Modrinth вернул недопустимый адрес файла.': 'Modrinth returned an invalid file URL.',
  'Не удалось скачать файл ({status}).': 'Could not download file ({status}).',
  'Modrinth не передал содержимое файла.': 'Modrinth did not provide the file contents.',
  'Не удалось записать скачанный файл на диск.': 'Could not write the downloaded file to disk.',
  'Скачанный файл неполный.': 'The downloaded file is incomplete.',
  'Не удалось определить категорию зависимости ({status}).': 'Could not determine the dependency category ({status}).',
  'Неизвестный тип зависимости Modrinth.': 'Unknown Modrinth dependency type.',
  'Укажите путь к javaw.exe или java.exe в настройках.': 'Set the path to javaw.exe or java.exe in Settings.',
  'Укажите полный путь к javaw.exe или java.exe в настройках.': 'Provide the full path to javaw.exe or java.exe in Settings.',
  'Minecraft запущен за {name}. Максимум памяти: {memory} МБ.': 'Minecraft launched as {name}. Maximum heap: {memory} MB.',
  'Не удалось запустить Minecraft.': 'Could not launch Minecraft.',
  'Minecraft закрыт.': 'Minecraft closed.',
  'Minecraft завершился с кодом {code}.': 'Minecraft exited with code {code}.',
  'Лог запуска сохранён в папке сборки: logs/nexium-launcher.log': 'Launch log saved in the instance folder: logs/nexium-launcher.log',
  'Не удалось сохранить лог запуска Minecraft.': 'Could not save the Minecraft launch log.',
  'Автоматически — лаунчер найдёт установленную Java нужной версии, а если её нет, скачает официальный рантайм Mojang.': 'Automatic — the launcher finds a suitable installed Java, and downloads the official Mojang runtime if none is found.',
  'Discord Rich Presence': 'Discord Rich Presence', 'Показывать в Discord открытую вкладку и активную сборку.': 'Show the current tab and active instance in Discord.', 'Смотрит вкладку': 'Viewing',
  'NEXIUM · Minecraft Launcher': 'NEXIUM · Minecraft Launcher',
}

function tr(text: string): string {
  if (activeLanguage !== 'en') return text
  const exact = englishTranslations[text]
  if (exact) return exact
  for (const [source, translation] of Object.entries(englishTranslations)) {
    const parts = source.split(/(\{[a-zA-Z]+\})/g)
    if (parts.length === 1) continue
    const pattern = new RegExp(`^${parts.map((part) => part.startsWith('{') ? '(.*?)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}$`)
    const match = text.match(pattern)
    if (!match) continue
    let placeholderIndex = 1
    return translation.replace(/\{[a-zA-Z]+\}/g, () => match[placeholderIndex++] ?? '')
  }
  return text
}

function trf(text: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), tr(text))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

function upsertInstance(instances: InstanceRecord[], instance: InstanceRecord): InstanceRecord[] {
  return [instance, ...instances.filter((item) => item.id !== instance.id)]
}

const verificationBadges: Record<VerificationBadgeType, { label: string; description: string; className: string; Icon: typeof ShieldCheck }> = {
  'trusted-creator': { label: 'Доверенный автор', description: 'Проверяет и публикует проверенные сборки без вредоносных файлов.', className: 'trusted-creator', Icon: ShieldCheck },
  developer: { label: 'Разработчик', description: 'Создаёт моды, плагины, клиенты или сам лаунчер.', className: 'developer', Icon: Code2 },
  official: { label: 'Официальный представитель', description: 'Администрация лаунчера и официальные партнёры.', className: 'official', Icon: Crown },
}

function VerificationBadge({ badge }: { badge: VerificationBadgeType }) {
  const definition = verificationBadges[badge]
  const { Icon } = definition
  return <span className={`verification-badge ${definition.className}`} title={`${tr(definition.label)} — ${tr(definition.description)}`} aria-label={`${tr(definition.label)} — ${tr(definition.description)}`}><Icon size={15} strokeWidth={2.4} /></span>
}

const navItems: Array<{ id: Page; label: string; icon: typeof LayoutGrid }> = [
  { id: 'home', label: 'Главная', icon: LayoutGrid },
  { id: 'instances', label: 'Сборки', icon: Box },
  { id: 'discover', label: 'Каталог', icon: Compass },
  { id: 'community', label: 'Сообщество', icon: MessageCircle },
]

const emptySettings: LauncherSettings = {
  instancesPath: '',
  playerName: 'Player',
  accountType: 'local',
  glassStrength: 58,
  showSnapshots: false,
  showModified: true,
  showOldReleases: false,
  showBetas: false,
  showAlphas: false,
  useLauncherLanguage: true,
  minecraftLanguage: 'ru_RU',
  javaPath: '',
  memoryMb: 4096,
  minecraftArguments: '',
  developerConsole: 'off',
  connectionQuality: 'good',
  launchBehavior: 'hide',
  launcherLanguage: 'ru',
  discordRpc: false,
  backgroundPath: '',
  backgroundKind: 'image',
  displayName: '',
  profileBio: '',
  profileAvatar: '',
  profileBadges: [],
}

function isLegacyRelease(id: string) {
  const [majorText, minorText, patchText = '0'] = id.split('.')
  const major = Number(majorText)
  const minor = Number(minorText)
  const patch = Number(patchText)
  return major === 1 && (minor < 5 || (minor === 5 && patch < 2))
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [settings, setSettings] = useState(emptySettings)
  const [language, setLanguage] = useState<LauncherSettings['launcherLanguage']>('ru')
  const [memoryLimitMb, setMemoryLimitMb] = useState(16384)
  const [minecraftVersions, setMinecraftVersions] = useState<MinecraftVersion[]>([])
  const [instances, setInstances] = useState<InstanceRecord[]>([])
  const [homesteadVideoUrl, setHomesteadVideoUrl] = useState('')
  const [launcherPath, setLauncherPath] = useState('')
  const [minecraftPath, setMinecraftPath] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<InstanceRecord | null>(null)
  const [notice, setNotice] = useState('')
  const [noticeRevision, setNoticeRevision] = useState(0)
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null)
  const [createReturnPage, setCreateReturnPage] = useState<Page | null>(null)
  const [catalogProjectId, setCatalogProjectId] = useState('')

  activeLanguage = language

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => window.nexium.onInstallProgress((progress) => {
    setInstallProgress(progress.phase === 'complete' || progress.phase === 'failed' ? null : progress)
  }), [])

  useEffect(() => window.nexium.onGameExit(({ code, logSaved }) => {
    if (code === 0) {
      showNotice(tr("Minecraft закрыт."))
      return
    }
    showNotice([
      trf('Minecraft завершился с кодом {code}.', { code: code ?? '?' }),
      logSaved ? tr('Лог запуска сохранён в папке сборки: logs/nexium-launcher.log') : tr("Не удалось сохранить лог запуска Minecraft."),
    ].join(' '))
  }), [])

  useEffect(() => {
    window.nexium.bootstrap()
      .then(({ settings: saved, instances: local, memoryLimitMb: available, launcherPath: appPath, minecraftPath: gamePath, homesteadVideoUrl: videoUrl }) => {
        setSettings(saved)
        setLanguage(saved.launcherLanguage)
        setInstances(local)
        setMemoryLimitMb(available)
        setSelectedId(local[0]?.id ?? '')
        setLauncherPath(appPath)
        setMinecraftPath(gamePath)
        setHomesteadVideoUrl(videoUrl)
      })
      .catch((error: Error) => setNotice(tr(error.message)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    window.nexium.listMinecraftVersions()
      .then(setMinecraftVersions)
      .catch((error: Error) => setNotice(trf('Не удалось загрузить версии Minecraft: {error}', { error: error.message })))
  }, [])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 3000)
    try {
      const AudioContextType = window.AudioContext
      if (AudioContextType) {
        const audio = new AudioContextType()
        const oscillator = audio.createOscillator()
        const gain = audio.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.value = 660
        gain.gain.setValueAtTime(0.025, audio.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12)
        oscillator.connect(gain)
        gain.connect(audio.destination)
        oscillator.start()
        oscillator.stop(audio.currentTime + 0.12)
        oscillator.onended = () => void audio.close()
      }
    } catch {
      // Audio feedback is optional; the notification remains visible.
    }
    return () => window.clearTimeout(timeout)
  }, [notice, noticeRevision])

  function showNotice(message: string) {
    setNotice(message)
    setNoticeRevision((revision) => revision + 1)
  }

  useEffect(() => {
    document.documentElement.style.setProperty('--glass-strength', String(settings.glassStrength / 100))
  }, [settings.glassStrength])

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--user-background-image',
      settings.backgroundPath && settings.backgroundKind === 'image' ? `url("${settings.backgroundPath}")` : "url('/fon.jpg')",
    )
  }, [settings.backgroundPath, settings.backgroundKind])

  const selected = instances.find((instance) => instance.id === selectedId) ?? instances[0]
  useEffect(() => {
    const pageName: Record<Page, string> = {
      home: tr('Главная'),
      instances: tr('Сборки'),
      discover: tr('Каталог'),
      community: tr('Сообщество'),
      settings: tr('Настройки'),
      profile: tr('Профиль игрока'),
    }
    const state = selected
      ? selected.kind === 'modpack'
        ? `${selected.name} · Minecraft ${selected.minecraftVersion}`
        : `Minecraft ${selected.minecraftVersion} · ${selected.loader}`
      : tr('NEXIUM · Minecraft Launcher')
    window.nexium.setDiscordPresence({
      page: `${tr('Смотрит вкладку')} ${pageName[page]}`,
      state,
      largeImage: selected?.kind === 'modpack' ? 'modpack_icon' : selected ? 'minecraft_logo' : 'nexium_logo',
      projectId: selected?.kind === 'modpack' ? selected.sourceProjectId ?? undefined : undefined,
    })
  }, [page, selected?.id, selected?.name, selected?.kind, selected?.minecraftVersion, selected?.loader, language])

  function openCreateModal(returnPage: Page = 'instances') {
    setCreateReturnPage(returnPage)
    setModalOpen(true)
  }

  async function saveSetting(patch: Partial<LauncherSettings>) {
    try {
      const next = await window.nexium.saveSettings(patch)
      setSettings(next)
      setLanguage(next.launcherLanguage)
      showNotice(tr("Сохранено!"))
      return true
    } catch (error) {
      showNotice(error instanceof Error ? tr(error.message) : tr("Не удалось сохранить настройки."))
      return false
    }
  }

  async function createInstance(input: InstanceInput): Promise<InstanceRecord | null> {
    try {
      const created = await window.nexium.createInstance(input)
      setInstances((current) => upsertInstance(current, created))
      setSelectedId(created.id)
      setModalOpen(false)
      if (createReturnPage) setPage(createReturnPage)
      else setPage('instances')
      setCreateReturnPage(null)
      showNotice(trf('«{name}» добавлена. Игровые файлы пока не установлены.', { name: created.name }))
      return created
    } catch (error) {
      showNotice(error instanceof Error ? tr(error.message) : tr("Не удалось создать сборку."))
      return null
    }
  }

  async function installInstance(id: string) {
    if (installProgress?.instanceId === id) return
    const existing = instances.find((instance) => instance.id === id)
    if (existing?.filesInstalled) return
    try {
      const updated = await window.nexium.installInstance(id)
      setInstances((current) => current.map((instance) => instance.id === id ? updated : instance))
      showNotice(trf('Файлы Minecraft {version} установлены.', { version: updated.minecraftVersion }))
    } catch (error) {
      setInstallProgress(null)
      showNotice(error instanceof Error ? tr(error.message) : tr("Не удалось установить Minecraft."))
    }
  }

  async function launchInstance(instance: InstanceRecord) {
    if (!instance.filesInstalled) {
      await installInstance(instance.id)
      return
    }
    try {
      const launched = await window.nexium.launchGame({
        instanceId: instance.id,
        username: settings.playerName,
        javaPath: settings.javaPath,
        memoryMb: settings.memoryMb,
      })
      setInstances((current) => current.map((item) => item.id === instance.id ? { ...item, lastPlayedAt: new Date().toISOString() } : item))
      showNotice(trf('Minecraft запущен за {name}. Максимум памяти: {memory} МБ.', { name: settings.playerName, memory: launched.memoryMb }))
    } catch (error) {
      showNotice(error instanceof Error ? tr(error.message) : tr("Не удалось запустить Minecraft."))
    }
  }

  async function updateInstance(id: string, patch: Partial<Pick<InstanceRecord, 'name' | 'favorite'>>) {
    try {
      const updated = await window.nexium.updateInstance(id, patch)
      setInstances((current) => current.map((instance) => instance.id === id ? updated : instance))
      showNotice(patch.name ? trf('Сборка переименована: {name}', { name: updated.name }) : patch.favorite ? tr("Сборка добавлена в избранное.") : tr("Сборка удалена из избранного."))
    } catch (error) {
      showNotice(error instanceof Error ? tr(error.message) : tr("Не удалось обновить сборку."))
    }
  }

  async function removeInstanceFiles(id: string) {
    if (!window.confirm(tr("Удалить все файлы этой сборки с диска? Она останется в библиотеке, но для игры её придётся установить заново."))) return
    try {
      await window.nexium.removeInstanceFiles(id)
      setInstances((current) => current.map((instance) => instance.id === id ? { ...instance, filesInstalled: false } : instance))
      showNotice(tr("Файлы сборки удалены. Профиль остался в библиотеке."))
    } catch (error) {
      showNotice(error instanceof Error ? tr(error.message) : tr("Не удалось удалить файлы сборки."))
    }
  }

  async function deleteInstance(id: string) {
    const instance = instances.find((item) => item.id === id)
    if (!instance) return
    if (!window.confirm(trf('Удалить «{name}» вместе со всей её папкой? Это действие нельзя отменить.', { name: instance.name }))) return
    try {
      await window.nexium.removeInstance(id, true)
      setInstances((current) => current.filter((item) => item.id !== id))
      if (selectedId === id) setSelectedId(instances.find((item) => item.id !== id)?.id ?? '')
      showNotice(trf('Сборка «{name}» удалена.', { name: instance.name }))
    } catch (error) {
      showNotice(error instanceof Error ? tr(error.message) : tr("Не удалось удалить сборку."))
    }
  }

  return (
    <LiquiThemeProvider theme={{ glass: {
      ...defaultGlassTheme,
      frost: settings.glassStrength / 100,
    } }}>
    <div className="app-shell dark">
      <div className="world-backdrop" />
      {settings.backgroundPath && settings.backgroundKind === 'video' && <video className="world-backdrop-video" src={settings.backgroundPath} autoPlay muted loop playsInline />}
      <div className="app-layout">
        <aside className="sidebar">
          <div className="nav-group">
            <div className="sidebar-brand"><img src="./nexium-logo.png" alt="" /><span>NEXIUM</span></div>
            {navItems.map(({ id, label, icon: Icon }) => (
              <button className={`nav-item ${page === id ? 'active' : ''}`} key={id} onClick={() => setPage(id)}>
                <Icon size={18} strokeWidth={1.8} />
                <span>{tr(label)}</span>
                {id === 'instances' && instances.length > 0 && <span className="nav-count">{instances.length}</span>}
              </button>
            ))}
          </div>
          <div className="sidebar-spacer" />
          <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}>
            <Settings2 size={18} strokeWidth={1.8} /><span>{tr("Настройки")}</span>
          </button>
          <div className="sidebar-footer">
            <button className="profile-chip-name" onClick={() => setPage('profile')} aria-label={tr("Открыть профиль игрока")}>
              <span className="avatar">{settings.profileAvatar ? <img src={settings.profileAvatar} alt="" /> : <UserRound size={15} />}</span><span className="profile-chip-name-text">{settings.displayName || settings.playerName}</span>{settings.profileBadges.map((badge) => <VerificationBadge key={badge} badge={badge} />)}
            </button>
            <button className={`account-menu-toggle ${loginOpen ? 'open' : ''}`} aria-expanded={loginOpen} onClick={() => setLoginOpen((open) => !open)} aria-label={tr("Аккаунты и вход")}><ChevronDown size={15} /></button>
            <button className="help-button" title={tr("Информация о приложении")} onClick={() => showNotice(tr("Десктопный лаунчер NEXIUM. Каталог загружает реальные проекты Modrinth."))}>
              <CircleHelp size={16} />
            </button>
          </div>
        </aside>

        <main className="main-panel">
          <header className="page-toolbar">
            <div className="breadcrumb"><span>NEXIUM</span><span className="breadcrumb-separator">/</span>{pageTitle(page)}</div>
            <div className="toolbar-actions">
              <button className="toolbar-icon" title={tr("Открыть папку NEXIUM")} onClick={() => void window.nexium.openInstancesFolder()}>
                <FolderOpen size={17} />
              </button>
            </div>
          </header>

          <div className="page-scroll">
            {loading ? <div className="loading-state">{tr("Загрузка библиотеки…")}</div> : (
              <>
                {page === 'home' && <HomePage settings={settings} instances={instances} versions={minecraftVersions} selected={selected} homesteadVideoUrl={homesteadVideoUrl} onSelect={setSelectedId} onCreate={() => openCreateModal('instances')} onNavigate={setPage} onProfile={() => setPage('profile')} onSaveNick={(playerName) => saveSetting({ playerName })} onInstallVersion={async (version, loader) => { const created = await createInstance({ name: loader === 'Vanilla' ? version : `${version} ${loader}`, minecraftVersion: version, loader }); if (created) await installInstance(created.id) }} onInstallInstance={(id) => void installInstance(id)} onLaunchInstance={(instance) => void launchInstance(instance)} onMessage={showNotice} onOpenRecommendation={(projectId) => { setCatalogProjectId(projectId); setPage('discover') }} />}
                {page === 'instances' && <InstancesPage instances={instances} selectedId={selectedId} onSelect={setSelectedId} onPlay={(instance) => { setSelectedId(instance.id); if (instance.filesInstalled) void launchInstance(instance); else void installInstance(instance.id) }} onCreate={() => openCreateModal('instances')} onOpenContent={(id) => { setSelectedId(id); setPage('discover') }} onRename={setRenameTarget} onUpdate={updateInstance} onRemoveFiles={removeInstanceFiles} onDelete={deleteInstance} />}
                {page === 'discover' && <DiscoverPage versions={minecraftVersions} instances={instances} featuredProjectId={catalogProjectId} selectedInstanceId={selectedId} onCreate={() => openCreateModal('discover')} onMessage={showNotice} onDownload={async (project, versionId, instanceId, gameVersion, loader, forceReinstall) => {
                  try {
                    let destinationId = instanceId
                    if (project.project_type === 'modpack') {
                      const created = await window.nexium.createInstance({
                        name: project.title.replace(/[<>:"/\\|?*]/g, '-').slice(0, 40),
                        minecraftVersion: gameVersion,
                        loader,
                        kind: 'modpack',
                        sourceProjectId: project.project_id,
                      })
                      setInstances((current) => upsertInstance(current, created))
                      setSelectedId(created.id)
                      destinationId = created.id
                    }
                    const result = await window.nexium.downloadModrinthVersion(project.project_id, versionId, destinationId, forceReinstall)
                    const importedInstance = result.instance
                    if (importedInstance) setInstances((current) => upsertInstance(current, importedInstance))
                    showNotice(result.alreadyInstalled ? tr("Эта сборка уже установлена.") : trf('Файлы сохранены в выбранную сборку ({count}).', { count: result.downloaded.length }))
                    return true
                  } catch (error) {
                    setInstallProgress(null)
                    showNotice(error instanceof Error ? tr(error.message) : tr("Не удалось скачать проект."))
                    return false
                  }
                }} />}
                {page === 'community' && <CommunityPage />}
                {page === 'settings' && <SettingsPage settings={settings} memoryLimitMb={memoryLimitMb} launcherPath={launcherPath} minecraftPath={minecraftPath} onSave={saveSetting} onLanguageChange={(nextLanguage) => { setLanguage(nextLanguage); return saveSetting({ launcherLanguage: nextLanguage }).then((saved) => { if (!saved) setLanguage(settings.launcherLanguage); return saved }) }} onMessage={showNotice} onMinecraftPathChange={(nextPath, nextInstancesPath) => { setMinecraftPath(nextPath); setSettings((current) => ({ ...current, instancesPath: nextInstancesPath })) }} />}
                {page === 'profile' && <PlayerProfilePage settings={settings} onSave={saveSetting} onBack={() => setPage('home')} />}
              </>
            )}
          </div>
        </main>
      </div>

      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label={tr("Закрыть")}><X size={15} /></button></div>}
      {installProgress && <div className="download-progress glass-panel" role="status">
        <div className="download-progress-copy"><strong>{installProgress.phase === 'preparing' ? tr("Подготовка установки…") : tr("Скачивание")}</strong><span>{installProgress.file || tr("Проверка файлов…")}</span>
          <small>{installProgress.totalBytes > 0 ? `${formatBytes(installProgress.downloadedBytes)} / ${formatBytes(installProgress.totalBytes)} · ${Math.min(100, Math.floor(installProgress.downloadedBytes / installProgress.totalBytes * 100))}% · ${tr("осталось")} ${formatBytes(Math.max(0, installProgress.totalBytes - installProgress.downloadedBytes))}` : formatBytes(installProgress.downloadedBytes)}</small>
        </div>
        <div className="download-progress-track"><span style={{ width: installProgress.totalBytes > 0 ? `${Math.min(100, installProgress.downloadedBytes / installProgress.totalBytes * 100)}%` : '8%' }} /></div>
      </div>}
      {modalOpen && <CreateInstanceModal versions={minecraftVersions} onClose={() => { setModalOpen(false); setCreateReturnPage(null) }} onCreate={createInstance} />}
      {loginOpen && <ProfileDialog settings={settings} onClose={() => setLoginOpen(false)} onSave={saveSetting} />}
      {renameTarget && <RenameInstanceDialog instance={renameTarget} onClose={() => setRenameTarget(null)} onSave={(name) => { void updateInstance(renameTarget.id, { name }).then(() => setRenameTarget(null)) }} />}
    </div>
    </LiquiThemeProvider>
  )
}

function pageTitle(page: Page) {
  return { home: tr("Главная"), instances: tr("Сборки"), discover: tr("Каталог"), community: tr("Сообщество"), settings: tr("Настройки"), profile: tr("Профиль игрока") }[page]
}

type SelectOption = { value: string; label: string; installed?: boolean }

function CustomSelect({ value, options, onChange, ariaLabel, className = '' }: {
  value: string
  options: SelectOption[]
  onChange(value: string): void
  ariaLabel: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const selectedOption = options.find((option) => option.value === value) ?? options[0]
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [open])
  return (
    <div className={`custom-select ${className}`} ref={root}>
      <button type="button" className="custom-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>{selectedOption?.label ?? tr("Выбрать")}</span><ChevronDown size={14} />
      </button>
      {open && <div className="custom-select-menu" role="listbox" aria-label={ariaLabel}>
        {options.map((option) => <button type="button" role="option" aria-selected={value === option.value} className={`${value === option.value ? 'selected ' : ''}${option.installed ? 'installed' : ''}`} key={option.value} onClick={() => { onChange(option.value); setOpen(false) }}>{option.label}</button>)}
      </div>}
    </div>
  )
}

function HomePage({ settings, instances, versions, selected, homesteadVideoUrl, onSelect, onCreate, onNavigate, onProfile, onSaveNick, onInstallVersion, onInstallInstance, onLaunchInstance, onMessage, onOpenRecommendation }: {
  settings: LauncherSettings
  instances: InstanceRecord[]
  versions: MinecraftVersion[]
  selected?: InstanceRecord
  homesteadVideoUrl: string
  onSelect(id: string): void
  onCreate(): void
  onNavigate(page: Page): void
  onProfile(): void
  onSaveNick(playerName: string): Promise<boolean>
  onInstallVersion(version: string, loader: string): void
  onInstallInstance(id: string): void
  onLaunchInstance(instance: InstanceRecord): void
  onMessage(message: string): void
  onOpenRecommendation(query: string): void
}) {
  const latestRelease = versions.find((version) => version.type === 'release')?.id
  const [versionId, setVersionId] = useState(selected?.id ?? (latestRelease ? `minecraft:${latestRelease}|Vanilla` : ''))
  const [slide, setSlide] = useState(0)
  const [editingNick, setEditingNick] = useState(false)
  const [nickDraft, setNickDraft] = useState(settings.playerName)
  useEffect(() => {
    if (selected) setVersionId(selected.id)
    else if (latestRelease && !versionId) setVersionId(`minecraft:${latestRelease}|Vanilla`)
  }, [selected?.id, latestRelease])
  const versionChoice = versionId.startsWith('minecraft:') ? versionId.slice('minecraft:'.length).split('|')[0] : ''
  const loaderChoice = versionId.startsWith('minecraft:') ? versionId.slice('minecraft:'.length).split('|')[1] ?? 'Vanilla' : ''
  const installedVersion = versionChoice ? instances.find((instance) => instance.minecraftVersion === versionChoice && instance.loader === loaderChoice && instance.filesInstalled) : undefined
  const current = versionChoice ? installedVersion : instances.find((instance) => instance.id === versionId) ?? selected
  const releaseOptions = versions.filter((version) => (version.type === 'release' && (settings.showOldReleases || !isLegacyRelease(version.id))) || (version.type === 'snapshot' && settings.showSnapshots) || (version.type === 'old_beta' && settings.showBetas) || (version.type === 'old_alpha' && settings.showAlphas)).flatMap((version) => {
    const options: SelectOption[] = []
    if (!instances.some((instance) => instance.kind === 'game' && instance.minecraftVersion === version.id && instance.loader === 'Vanilla')) {
      options.push({ value: `minecraft:${version.id}|Vanilla`, label: version.id })
    }
    if (settings.showModified && version.type === 'release') {
      if (!instances.some((instance) => instance.kind === 'game' && instance.minecraftVersion === version.id && instance.loader === 'Fabric')) {
        options.push({ value: `minecraft:${version.id}|Fabric`, label: `${version.id} Fabric` })
      }
      if (!instances.some((instance) => instance.kind === 'game' && instance.minecraftVersion === version.id && instance.loader === 'Forge')) {
        options.push({ value: `minecraft:${version.id}|Forge`, label: `${version.id} Forge` })
      }
    }
    return options
  })
  const versionOptions = [
    ...instances.slice().sort((a, b) => Number(b.favorite) - Number(a.favorite)).map((instance) => ({
      value: instance.id,
      label: `${instance.favorite ? '★ ' : ''}${instance.kind === 'modpack' ? instance.name : instance.loader === 'Vanilla' ? instance.minecraftVersion : `${instance.minecraftVersion} ${instance.loader}`}`,
      installed: instance.filesInstalled,
    })),
    ...releaseOptions,
  ]
  const slides = [
    { label: tr("NEXIUM · ОФИЦИАЛЬНЫЕ КАНАЛЫ"), title: tr("Твой мир начинается здесь"), body: tr("Новости проекта, обновления и новые возможности лаунчера."), action: tr("Открыть сайт NEXIUM"), projectId: '' },
    { label: tr("РЕКОМЕНДАЦИЯ СБОРКИ"), title: 'Prominence II: Hasturian Era', body: tr("Большое приключение с исследованием, магией и технологиями."), action: tr("Посмотреть"), projectId: 'EGs3lC8D' },
    { label: tr("РЕКОМЕНДАЦИЯ СБОРКИ"), title: 'Homestead', body: tr("Уютное приключение: исследуй мир, выполняй задания и создай свой дом."), action: tr("Посмотреть"), projectId: '6HvKwSky' },
  ]

  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" />MINECRAFT · NEXIUM</div>
          <h1>{tr("Твоя игра.")}<br /><span>{tr("Твои миры.")}</span></h1>
          <p>{tr("Выбери версию или сборку и продолжай с того места, где остановился.")}</p>
          <div className="home-player">
            <span className="avatar">{settings.profileAvatar ? <img src={settings.profileAvatar} alt="" /> : <UserRound size={17} />}</span>
            {editingNick ? <form className="home-nick-editor" onSubmit={(event) => { event.preventDefault(); void onSaveNick(nickDraft).then((saved) => { if (saved) setEditingNick(false) }) }}><input aria-label={tr("Игровой никнейм")} minLength={3} maxLength={16} pattern="[A-Za-z0-9_]{3,16}" value={nickDraft} onChange={(event) => setNickDraft(event.target.value)} autoFocus /><button className="text-button" type="submit">{tr("Сохранить")}</button><button className="text-button" type="button" onClick={() => { setNickDraft(settings.playerName); setEditingNick(false) }}>{tr("Отмена")}</button></form> : <div><strong>{settings.displayName || settings.playerName}</strong><span>{settings.accountType === 'local' ? trf('Игровой ник: {name}', { name: settings.playerName }) : 'NEXIUM'}</span></div>}
            {!editingNick && <div className="home-profile-badges">{settings.profileBadges.map((badge) => <VerificationBadge key={badge} badge={badge} />)}</div>}
            {!editingNick && <button className="home-nick-edit" aria-label={tr("Изменить игровой никнейм")} title={tr("Изменить игровой никнейм")} onClick={() => { setNickDraft(settings.playerName); setEditingNick(true) }}><Pencil size={14} /></button>}
            <button className="outline-button" onClick={onProfile}>{tr("Профиль")}{' '}<ChevronRight size={14} /></button>
          </div>
          <div className="home-launch glass-panel">
            <div className="launch-selection">
              <label className="field-label" htmlFor="launch-version">{tr("ВЕРСИЯ ИЛИ СБОРКА")}</label>
              <CustomSelect ariaLabel={tr("Выбор сборки или версии Minecraft")} value={versionChoice ? `minecraft:${versionChoice}|${loaderChoice}` : current?.id ?? ''} options={versionOptions} onChange={(value) => {
                setVersionId(value)
                if (!value.startsWith('minecraft:')) onSelect(value)
              }} />
              {current ? <span className="launch-subtitle">{current.loader} · {current.lastPlayedAt ? trf('запуск {date}', { date: new Date(current.lastPlayedAt).toLocaleDateString(activeLanguage === 'en' ? 'en-US' : 'ru-RU') }) : tr("ещё не запускалась")}</span> : !versionChoice && <span className="launch-subtitle">{versions.length ? tr("Выбери сборку или версию Minecraft") : tr("Загружаем версии Minecraft…")}</span>}
            </div>
            <button className={`primary-button launch-button ${current?.filesInstalled ? 'installed' : ''}`} disabled={!current && !versionChoice} onClick={() => {
              if (current?.filesInstalled) {
                onLaunchInstance(current)
                return
              }
              if (versionChoice) {
                onInstallVersion(versionChoice, loaderChoice)
                return
              }
              if (!current) return
              onInstallInstance(current.id)
            }}>
              <Gamepad2 size={18} />{current?.filesInstalled ? tr("Играть") : tr("Установить")}
            </button>
          </div>
          <div className="hero-actions">
            <button className="quiet-button" onClick={() => onNavigate('discover')}><Compass size={17} />{tr("Каталог")}</button>
            <button className="quiet-button" onClick={() => onCreate()}><Plus size={17} />{tr("Создать сборку")}</button>
          </div>
        </div>
        <div className="recommended-banner" aria-roledescription={tr("карусель")}>
          <div className={`recommended-image recommended-image-${slide}`}>
            {slide === 2 && homesteadVideoUrl && <video className="recommended-video" src={homesteadVideoUrl} autoPlay muted loop playsInline preload="auto" />}
          </div>
          <div className={`recommended-overlay recommended-overlay-${slide}`} />
          <div className="recommended-label"><span>0{slide + 1}</span> {slides[slide].label}</div>
          <div className="recommended-content"><h2>{slides[slide].title}</h2><p>{slides[slide].body}</p>{slide === 0 ? <div className="banner-links"><button className="outline-button" onClick={() => void window.nexium.openExternal('https://nexiumlauncher.netlify.app')}>{tr("Сайт NEXIUM")}{' '}<ArrowUpRight size={14} /></button><button className="outline-button" onClick={() => void window.nexium.openExternal('https://t.me/NexiumLauncher')}>Telegram <ArrowUpRight size={14} /></button></div> : <button className="outline-button" onClick={() => onOpenRecommendation(slides[slide].projectId)}><Compass size={14} />{slides[slide].action}</button>}</div>
          <div className="recommended-bottom"><button className="carousel-arrow" aria-label={tr("Предыдущий баннер")} onClick={() => setSlide((current) => (current + 2) % 3)}><ChevronLeft size={17} /></button><span className="carousel-dots">{slides.map((item, index) => <button aria-label={trf('Слайд {number}', { number: index + 1 })} className={slide === index ? 'active' : ''} key={item.title} onClick={() => setSlide(index)} />)}</span><button className="carousel-arrow" aria-label={tr("Следующий баннер")} onClick={() => setSlide((current) => (current + 1) % 3)}><ChevronRight size={17} /></button></div>
        </div>
      </section>

      <section className="library-section">
        <div className="section-heading">
          <div><span className="eyebrow-small">{tr("ИГРОВАЯ БИБЛИОТЕКА")}</span><h2>{tr("Недавние сборки")}</h2></div>
          <div className="heading-actions">
            <span className="subtle-count">{instances.length} {pluralInstances(instances.length)}</span>
            <button className="outline-button" onClick={() => onNavigate('instances')}>{tr("Все сборки")}{' '}<ChevronRight size={14} /></button>
          </div>
        </div>
        {instances.length === 0 ? (
          <div className="empty-library glass-panel">
            <div className="empty-cube"><Box size={23} /></div>
            <div className="empty-copy"><strong>{tr("Здесь пока пусто")}</strong><span>{tr("Создай отдельную сборку для каждого мира или набора модов.")}</span></div>
            <button className="text-button" onClick={onCreate}>{tr("Создать первую")}{' '}<ArrowUpRight size={15} /></button>
          </div>
        ) : (
          <div className="instance-row">
            {instances.slice(0, 3).map((instance) => (
              <button className={`instance-card glass-panel ${selected?.id === instance.id ? 'selected' : ''}`} key={instance.id} onClick={() => onSelect(instance.id)}>
                <div className="instance-card-art"><span className="instance-version">{instance.minecraftVersion}</span><Box size={27} /></div>
                <div className="instance-meta"><strong>{instance.name}</strong><span>{instance.loader} · {instance.filesInstalled ? tr("Установлена") : tr("Файлы не установлены")}</span></div>
                <ArrowUpRight className="instance-arrow" size={16} />
              </button>
            ))}
            {instances.length > 3 && <button className="more-card" onClick={() => onNavigate('instances')}>+{instances.length - 3}<span>{tr("все сборки")}</span></button>}
          </div>
        )}
      </section>
    </div>
  )
}

function InstancesPage({ instances, selectedId, onSelect, onPlay, onCreate, onOpenContent, onRename, onUpdate, onRemoveFiles, onDelete }: {
  instances: InstanceRecord[]
  selectedId: string
  onSelect(id: string): void
  onPlay(instance: InstanceRecord): void
  onCreate(): void
  onOpenContent(id: string): void
  onRename(instance: InstanceRecord): void
  onUpdate(id: string, patch: Partial<Pick<InstanceRecord, 'name' | 'favorite'>>): void
  onRemoveFiles(id: string): void
  onDelete(id: string): void
}) {
  return (
    <div className="content-page">
      <div className="page-heading-row">
        <div><span className="eyebrow-small">{tr("ТВОЯ БИБЛИОТЕКА")}</span><h1>{tr("Сборки")}</h1><p>{tr("Отдельные профили и папки для каждого способа играть.")}</p></div>
        <button className="primary-button compact" onClick={onCreate}><Plus size={17} />{tr("Создать сборку")}</button>
      </div>
      {instances.length === 0 ? <div className="empty-state glass-panel"><Box size={25} /><strong>{tr("Нет сборок")}</strong><span>{tr("Создай первую, чтобы начать организовывать Minecraft.")}</span><button className="outline-button" onClick={onCreate}><Plus size={15} />{tr("Новая сборка")}</button></div> : (
        <div className="instance-list">
          {instances.map((instance) => (
            <div className={`instance-list-row glass-panel ${selectedId === instance.id ? 'selected' : ''}`} key={instance.id} onClick={() => onSelect(instance.id)}>
              <div className="instance-mini-icon"><Box size={19} /></div>
              <div className="instance-list-info"><strong>{instance.name}</strong><span>Minecraft {instance.minecraftVersion} <i /> {instance.loader} <i /> {instance.lastPlayedAt ? trf('запуск {date}', { date: new Date(instance.lastPlayedAt).toLocaleDateString(activeLanguage === 'en' ? 'en-US' : 'ru-RU') }) : tr("ещё не запускалась")}</span></div>
              <span className={`install-state ${instance.filesInstalled ? 'installed' : ''}`}>{instance.filesInstalled ? tr("Установлена") : tr("Не установлена")}</span>
              <button className="toolbar-icon" title={tr("Запустить сборку")} aria-label={tr("Запустить сборку")} onClick={(event) => { event.stopPropagation(); onPlay(instance) }}><Play size={16} fill="currentColor" /></button>
              {instance.kind === 'game' && <button className="outline-button compact" onClick={(event) => { event.stopPropagation(); onOpenContent(instance.id) }}><Plus size={14} />{tr("Контент")}</button>}
              <button className={`toolbar-icon ${instance.favorite ? 'favorite-active' : ''}`} title={instance.favorite ? tr("Убрать из избранного") : tr("В избранное")} onClick={(event) => { event.stopPropagation(); onUpdate(instance.id, { favorite: !instance.favorite }) }}><Star size={16} fill={instance.favorite ? 'currentColor' : 'none'} /></button>
              <button className="toolbar-icon" title={tr("Переименовать")} onClick={(event) => { event.stopPropagation(); onRename(instance) }}><Pencil size={16} /></button>
              <button className="toolbar-icon" title={tr("Открыть папку сборки")} onClick={(event) => { event.stopPropagation(); void window.nexium.openInstanceFolder(instance.id) }}><FolderOpen size={16} /></button>
              <button className="toolbar-icon" title={tr("Удалить файлы, оставить профиль")} onClick={(event) => { event.stopPropagation(); onRemoveFiles(instance.id) }}><HardDrive size={16} /></button>
              <button className="toolbar-icon danger-action" title={tr("Удалить сборку и папку")} onClick={(event) => { event.stopPropagation(); onDelete(instance.id) }}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DiscoverPage({ versions, instances, featuredProjectId, selectedInstanceId, onCreate, onMessage, onDownload }: {
  versions: MinecraftVersion[]
  instances: InstanceRecord[]
  featuredProjectId: string
  selectedInstanceId: string
  onCreate(): void
  onMessage(message: string): void
  onDownload(project: ModrinthProject, versionId: string, instanceId: string, gameVersion: string, loader: string, forceReinstall: boolean): Promise<boolean>
}) {
  const [type, setType] = useState<ProjectType>('modpack')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('relevance')
  const [gameVersion, setGameVersion] = useState('')
  const [category, setCategory] = useState('')
  const [projects, setProjects] = useState<ModrinthProject[]>([])
  const [totalHits, setTotalHits] = useState(0)
  const [activeProject, setActiveProject] = useState<ModrinthProject | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const featuredRequest = useRef('')
  const [targetInstanceId, setTargetInstanceId] = useState(selectedInstanceId || (instances.find((instance) => instance.kind === 'game')?.id ?? ''))
  const gameInstances = instances.filter((instance) => instance.kind === 'game')
  useEffect(() => {
    if (gameInstances.some((instance) => instance.id === selectedInstanceId)) setTargetInstanceId(selectedInstanceId)
    else if (gameInstances.length && !gameInstances.some((instance) => instance.id === targetInstanceId)) setTargetInstanceId(gameInstances[0].id)
    if (!gameInstances.length) setTargetInstanceId('')
  }, [instances, selectedInstanceId, targetInstanceId])
  const types: Array<{ id: ProjectType; label: string }> = [
    { id: 'modpack', label: tr("Сборки") },
    { id: 'mod', label: tr("Моды") },
    { id: 'resourcepack', label: tr("Ресурспаки") },
    { id: 'shader', label: tr("Шейдеры") },
  ]
  async function search(reset = true, searchQuery = query) {
    setLoading(true)
    setLoadingMore(!reset)
    setError('')
    const offset = reset ? 0 : projects.length
    try {
      const result = await window.nexium.searchModrinth(searchQuery, type, offset, sort, gameVersion, category)
      setProjects((current) => reset ? result.hits : [...current, ...result.hits])
      setTotalHits(result.total_hits)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить каталог.")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }
  useEffect(() => { void search() }, [type, sort, gameVersion, category])
  useEffect(() => {
    if (!featuredProjectId || featuredRequest.current === featuredProjectId) return
    featuredRequest.current = featuredProjectId
    let active = true
    window.nexium.getModrinthProject(featuredProjectId)
      .then((details) => {
        if (!active) return
        setActiveProject({
          project_id: details.project_id,
          project_type: details.project_type,
          title: details.title,
          description: details.description,
          icon_url: details.icon_url,
          downloads: details.downloads,
          author: details.author,
          categories: details.categories,
        })
      })
      .catch((caught: unknown) => {
        if (active) onMessage(caught instanceof Error ? tr(caught.message) : tr("Не удалось открыть сборку."))
      })
    return () => { active = false }
  }, [featuredProjectId])
  const numberFormat = useMemo(() => new Intl.NumberFormat(activeLanguage === 'en' ? 'en-US' : 'ru-RU', { notation: 'compact' }), [activeLanguage])
  const categoryOptions: Record<ProjectType, Array<[string, string]>> = {
    modpack: [['adventure',tr("Исследование и приключения")],['challenging',tr("Сложные")],['combat',tr("Сражения")],['kitchen-sink',tr("Сборники")],['lightweight',tr("Лёгкие")],['magic',tr("Магия")],['multiplayer',tr("Мультиплеер")],['optimization',tr("Оптимизация")],['quests',tr("Квесты")],['technology',tr("Технологии")]],
    mod: [['adventure',tr("Приключения")],['decoration',tr("Декор")],['equipment',tr("Снаряжение")],['food',tr("Еда")],['magic',tr("Магия")],['mobs',tr("Мобы")],['optimization',tr("Оптимизация")],['storage',tr("Хранилища")],['technology',tr("Технологии")],['utility',tr("Утилиты")],['worldgen',tr("Генерация мира")]],
    resourcepack: [['16x','16x'],['32x','32x'],['64x','64x'],['128x','128x'],['256x','256x'],['realistic',tr("Реалистичные")],['simplistic',tr("Минималистичные")],['themed',tr("Тематические")],['vanilla-like',tr("В стиле Minecraft")]],
    shader: [['fantasy',tr("Фэнтези")],['realistic',tr("Реалистичные")],['vanilla-like',tr("В стиле Minecraft")],['semi-realistic',tr("Полуреалистичные")],['low',tr("Лёгкие")],['screenshot',tr("Для скриншотов")]],
  }
  const gameVersionOptions = [{ value: '', label: tr("Любая версия") }, ...versions.filter((version) => version.type === 'release').map((version) => ({ value: version.id, label: version.id }))]
  const sortOptions: SelectOption[] = [['relevance', tr("Релевантность")], ['downloads', tr("Загрузки")], ['follows', tr("Популярность")], ['updated', tr("Дата обновления")]].map(([value, label]) => ({ value, label }))

  return (
    <div className="content-page discover-page">
      <div className="page-heading-row">
        <div><span className="eyebrow-small">{tr("MODRINTH · ЖИВОЙ КАТАЛОГ")}</span><h1>{tr("Найди своё следующее")}</h1><p>{tr("Ищи модпаки, моды и ресурсы. Данные загружаются напрямую из Modrinth.")}</p></div>
        {type !== 'modpack' && <button className="primary-button compact" onClick={onCreate}><Plus size={16} />{tr("Создать сборку")}</button>}
      </div>
      <form className="search-bar glass-panel" onSubmit={(event) => { event.preventDefault(); void search() }}>
        <Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Что ищем?")} /><button type="submit"><Search size={16} /><span>{tr("Найти")}</span></button>
      </form>
      <div className="catalog-tabs">
        {types.map((item) => <button className={type === item.id ? 'active' : ''} key={item.id} onClick={() => { setType(item.id); setCategory('') }}>{item.label}</button>)}
      </div>
      <div className="catalog-filters">
        <label>{tr("Источник")}<CustomSelect ariaLabel={tr("Источник каталога")} value="modrinth" options={[{ value: 'modrinth', label: 'Modrinth' }]} onChange={() => {}} /></label>
        <label>{tr("Версия")}<CustomSelect ariaLabel={tr("Фильтр версии игры")} value={gameVersion} options={gameVersionOptions} onChange={setGameVersion} /></label>
        <label>{tr("Категория")}<CustomSelect ariaLabel={tr("Фильтр категории")} value={category} options={[{ value: '', label: tr("Любая категория") }, ...categoryOptions[type].map(([value, label]) => ({ value, label }))]} onChange={setCategory} /></label>
        <label>{tr("Сортировка")}<CustomSelect ariaLabel={tr("Сортировка каталога")} value={sort} options={sortOptions} onChange={setSort} /></label>
      </div>
      {type !== 'modpack' && <div className="catalog-target glass-panel"><span>{tr("Установить в сборку")}</span>{gameInstances.length ? <CustomSelect ariaLabel={tr("Выбрать сборку для установки")} value={targetInstanceId} options={gameInstances.map((instance) => ({ value: instance.id, label: `${instance.name} · ${instance.minecraftVersion} ${instance.loader}` }))} onChange={setTargetInstanceId} /> : <button className="text-button" onClick={onCreate}>{tr("Создать сборку")}{' '}<ChevronRight size={14} /></button>}</div>}
      {loading && !projects.length ? <div className="loading-state">{tr("Загружаем проекты Modrinth…")}</div> : error ? <div className="error-panel">{tr(error)}<button className="text-button" onClick={() => void search()}>{tr("Повторить")}</button></div> : (
        <>
          <div className="project-grid">
            {projects.map((project) => (
              <button className="project-card glass-panel" key={project.project_id} onClick={() => setActiveProject(project)}>
                <div className="project-top">
                  {project.icon_url ? <img src={project.icon_url} alt="" /> : <div className="project-placeholder"><Box size={19} /></div>}
                  <div><h3>{project.title}</h3><span>{tr("от")}{' '}{project.author}</span></div>
                </div>
                <p>{project.description}</p>
                <div className="project-bottom"><span><ArrowDownToLine size={13} />{numberFormat.format(project.downloads)}</span><span className="catalog-source">Modrinth</span></div>
              </button>
            ))}
            {!projects.length && !loading && <div className="no-results">{tr("Проекты не найдены. Попробуй другой запрос.")}</div>}
          </div>
          {projects.length < totalHits && <div className="catalog-load-more"><button className="outline-button" disabled={loadingMore} onClick={() => void search(false)}>{loadingMore ? tr("Загружаем…") : tr("Загрузить ещё")}</button><span>{projects.length} {tr("из")}{' '}{numberFormat.format(totalHits)}</span></div>}
        </>
      )}
      {loading && projects.length > 0 && !loadingMore && <div className="loading-state">{tr("Обновляем каталог…")}</div>}
      {activeProject && <ProjectDetailDialog project={activeProject} instances={instances} targetInstanceId={targetInstanceId} onDownload={onDownload} onMessage={onMessage} onClose={() => setActiveProject(null)} />}
    </div>
  )
}

type ProjectDetailTab = 'overview' | 'gallery' | 'versions'

function MarkdownContent({ content }: { content: string }) {
  const inline = (text: string, keyPrefix: string): ReactNode[] => {
    const normalized = text.replace(/\]\(<(https?:\/\/[^>\s]+)>\)/gi, ']($1)')
    const tokens = normalized.split(/(\[!\[[^\]]*\]\(https?:\/\/[^)\s]+\)\]\(https?:\/\/[^)\s]+\)|!\[[^\]]*\]\(https?:\/\/[^)\s]+\)|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\\?\*\*.+?\\?\*\*|\\?__.+?\\?__|\\?\*[^*]+?\\?\*|\\?_[^_]+?\\?_|`[^`]+`)/g).filter(Boolean)
    return tokens.map((part, index) => {
      const key = `${keyPrefix}-${index}`
      const linkedImage = part.match(/^\[!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)\]\((https?:\/\/[^)\s]+)\)$/i)
      if (linkedImage) return <a key={key} href={linkedImage[3]} target="_blank" rel="noreferrer"><img className="project-description-image" src={linkedImage[2]} alt={linkedImage[1]} loading="lazy" /></a>
      const image = part.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/i)
      if (image) return <img className="project-description-image" key={key} src={image[2]} alt={image[1]} loading="lazy" />
      const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i)
      if (link) return <a key={key} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>
      if (/^\\?\*\*.+\\?\*\*$/.test(part) || /^\\?__.+\\?__$/.test(part)) return <strong key={key}>{part.replace(/^\\?(\*\*|__)/, '').replace(/\\?(\*\*|__)$/, '')}</strong>
      if (/^\\?\*[^*]+\\?\*$/.test(part) || /^\\?_[^_]+?_$/.test(part)) return <em key={key}>{part.replace(/^\\?(\*|_)/, '').replace(/\\?(\*|_)$/, '')}</em>
      if (part.startsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>
      return part
    })
  }
  const renderMarkdown = (source: string, keyPrefix: string): ReactNode[] => {
    const normalized = source.replace(/\r/g, '')
      .replace(/([^\n])\s+(#{1,6}\s+)/g, '$1\n$2')
      .replace(/\s+([-*+]\s+(?=\S))/g, '\n$1')
    const blocks: ReactNode[] = []
    let paragraph: string[] = []
    let list: string[] = []
    let orderedList: string[] = []
    const flushParagraph = () => {
      const text = paragraph.join(' ').trim()
      if (text) blocks.push(<p key={`${keyPrefix}-p-${blocks.length}`}>{inline(text, `${keyPrefix}-pi-${blocks.length}`)}</p>)
      paragraph = []
    }
    const flushList = () => {
      if (list.length) blocks.push(<ul className="project-html-list" key={`${keyPrefix}-ul-${blocks.length}`}>{list.map((item, index) => <li key={index}>{inline(item, `${keyPrefix}-li-${index}`)}</li>)}</ul>)
      list = []
      if (orderedList.length) blocks.push(<ol className="project-html-list" key={`${keyPrefix}-ol-${blocks.length}`}>{orderedList.map((item, index) => <li key={index}>{inline(item, `${keyPrefix}-oli-${index}`)}</li>)}</ol>)
      orderedList = []
    }
    for (const rawLine of normalized.split('\n')) {
      const text = rawLine.trim()
      if (!text || /^#+\s*$/.test(text) || /^\[!?[^\]]*\]:\s*https?:\/\//i.test(text) || /^[-*_]{3,}$/.test(text)) {
        flushParagraph()
        flushList()
        continue
      }
      const heading = text.match(/^(#{1,6})\s+(.+)$/)
      if (heading) {
        flushParagraph()
        flushList()
        blocks.push(<h3 key={`${keyPrefix}-h-${blocks.length}`}>{inline(heading[2], `${keyPrefix}-hi-${blocks.length}`)}</h3>)
        continue
      }
      const item = text.match(/^[-*+]\s+(.+)$/)
      if (item) {
        flushParagraph()
        if (orderedList.length) {
          blocks.push(<ol className="project-html-list" key={`${keyPrefix}-ol-${blocks.length}`}>{orderedList.map((entry, index) => <li key={index}>{inline(entry, `${keyPrefix}-oli-${index}`)}</li>)}</ol>)
          orderedList = []
        }
        list.push(item[1])
        continue
      }
      const orderedItem = text.match(/^\d+[.)]\s+(.+)$/)
      if (orderedItem) {
        flushParagraph()
        if (list.length) {
          blocks.push(<ul className="project-html-list" key={`${keyPrefix}-ul-${blocks.length}`}>{list.map((entry, index) => <li key={index}>{inline(entry, `${keyPrefix}-li-${index}`)}</li>)}</ul>)
          list = []
        }
        orderedList.push(orderedItem[1])
        continue
      }
      flushList()
      if (text.startsWith('>')) {
        flushParagraph()
        blocks.push(<blockquote key={`${keyPrefix}-q-${blocks.length}`}>{inline(text.replace(/^>\s?/, ''), `${keyPrefix}-qi-${blocks.length}`)}</blockquote>)
        continue
      }
      paragraph.push(text)
    }
    flushParagraph()
    flushList()
    return blocks
  }
  if (/<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\s*\/?>/i.test(content)) {
    const template = document.createElement('template')
    template.innerHTML = content
    const inlineTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'sup', 'sub', 'span', 'a', 'code', 'kbd', 'figcaption', 'summary'])
    const renderNode = (node: Node, key: string, inlineContext = false): ReactNode => {
      if (node.nodeType === Node.TEXT_NODE) return inlineContext ? inline(node.textContent ?? '', key) : renderMarkdown(node.textContent ?? '', key)
      if (!(node instanceof HTMLElement)) return null
      const tag = node.tagName.toLowerCase()
      if (['script', 'style', 'iframe', 'object', 'embed', 'video', 'audio', 'form'].includes(tag)) return null
      const children = Array.from(node.childNodes).map((child, index) => renderNode(child, `${key}-${index}`, inlineContext || inlineTags.has(tag)))
      if (tag === 'center') return <div className="project-centered" key={key}>{children}</div>
      if (tag === 'br') return <br key={key} />
      if (tag === 'hr') return <hr key={key} />
      if (tag === 'img') {
        const source = node.getAttribute('src') ?? ''
        if (!/^https:\/\//i.test(source)) return null
        return <img className="project-description-image" key={key} src={source} alt={node.getAttribute('alt') ?? ''} loading="lazy" />
      }
      if (tag === 'a') {
        const href = node.getAttribute('href') ?? ''
        return /^https:\/\//i.test(href) ? <a key={key} href={href} target="_blank" rel="noreferrer">{children}</a> : <span key={key}>{children}</span>
      }
      const elementTags: Record<string, string> = {
        p: 'p', div: 'div', h1: 'h3', h2: 'h3', h3: 'h3', h4: 'h4', h5: 'h4', h6: 'h4',
        strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'u', s: 'del', del: 'del',
        sup: 'sup', sub: 'sub', span: 'span', ul: 'ul', ol: 'ol', li: 'li',
        blockquote: 'blockquote', code: 'code', pre: 'pre', table: 'table', thead: 'thead',
        tbody: 'tbody', tr: 'tr', th: 'th', td: 'td', figure: 'figure', figcaption: 'figcaption',
        details: 'details', summary: 'summary', kbd: 'kbd',
      }
      const elementTag = elementTags[tag]
      return elementTag ? createElement(elementTag, { key, className: tag === 'ul' || tag === 'ol' ? 'project-html-list' : undefined }, children) : children
    }
    return <div className="project-body project-html-body">{Array.from(template.content.childNodes).map((node, index) => renderNode(node, `html-${index}`))}</div>
  }
  return <div className="project-body">{renderMarkdown(content, 'markdown')}</div>
}

function ProjectDetailDialog({ project, instances, targetInstanceId, onDownload, onMessage, onClose }: {
  project: ModrinthProject
  instances: InstanceRecord[]
  targetInstanceId: string
  onDownload(project: ModrinthProject, versionId: string, instanceId: string, gameVersion: string, loader: string, forceReinstall: boolean): Promise<boolean>
  onMessage(message: string): void
  onClose(): void
}) {
  const [details, setDetails] = useState<ModrinthProjectDetails | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<ProjectDetailTab>('overview')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let active = true
    window.nexium.getModrinthProject(project.project_id)
      .then((result) => { if (active) setDetails(result) })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Не удалось загрузить проект.")
      })
    return () => { active = false }
  }, [project.project_id])

  const date = (value: string) => new Date(value).toLocaleDateString(activeLanguage === 'en' ? 'en-US' : 'ru-RU')
  const target = instances.find((instance) => instance.id === targetInstanceId)
  const installedPack = project.project_type === 'modpack'
    ? instances.find((instance) => instance.kind === 'modpack' && instance.sourceProjectId === project.project_id && instance.filesInstalled)
    : undefined
  const projectVersions = details?.versions ?? []
  const compatibleVersion = projectVersions.find((version) => {
    if (project.project_type === 'modpack') {
      return !installedPack || version.game_versions.includes(installedPack.minecraftVersion)
    }
    if (!target) return true
    if (!version.game_versions.includes(target.minecraftVersion)) return false
    if (project.project_type === 'mod') {
      return target.loader === 'Vanilla'
        ? version.loaders.length === 0
        : version.loaders.some((loader) => loader.toLowerCase() === target.loader.toLowerCase())
    }
    return true
  })
  const canRepairInstalledPack = Boolean(installedPack?.loader === 'Vanilla' &&
    compatibleVersion?.loaders.some((loader) => loader.toLowerCase() !== 'vanilla'))
  async function downloadSelected() {
    if (installedPack && !canRepairInstalledPack) {
      onMessage(tr("Эта сборка уже установлена."))
      return
    }
    if (!compatibleVersion) {
      onMessage(target ? trf('Для {version} {loader} нет совместимой версии проекта.', { version: target.minecraftVersion, loader: target.loader }) : tr("Сначала создайте сборку и выберите её в каталоге."))
      return
    }
    setDownloading(true)
    const gameVersion = project.project_type === 'modpack'
      ? installedPack?.minecraftVersion ?? compatibleVersion.game_versions[0] ?? 'unknown'
      : target?.minecraftVersion ?? compatibleVersion.game_versions[0] ?? 'unknown'
    const loader = project.project_type === 'modpack'
      ? compatibleVersion.loaders[0] ?? 'Vanilla'
      : target?.loader ?? compatibleVersion.loaders[0] ?? 'Vanilla'
    const completed = await onDownload(project, compatibleVersion.id, targetInstanceId, gameVersion, loader, canRepairInstalledPack)
    setDownloading(false)
    if (completed) onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="project-detail glass-panel" aria-label={trf('Проект {title}', { title: project.title })}>
        <div className="modal-heading">
          <div className="project-detail-heading">
            {project.icon_url ? <img src={project.icon_url} alt="" /> : <div className="project-placeholder"><Box size={19} /></div>}
            <div><span className="eyebrow-small">{tr("ПРОЕКТ MODRINTH")}</span><h2>{project.title}</h2><span>{tr("от")}{' '}{project.author}</span></div>
            <button className={`primary-button compact project-download ${installedPack && !canRepairInstalledPack ? 'installed' : ''}`} disabled={!compatibleVersion || downloading || (Boolean(installedPack) && !canRepairInstalledPack) || (project.project_type !== 'modpack' && !target)} onClick={() => void downloadSelected()}>{installedPack && !canRepairInstalledPack ? <Check size={15} /> : <ArrowDownToLine size={15} />}{installedPack && !canRepairInstalledPack ? tr("Установлена") : canRepairInstalledPack ? tr("Переустановить") : downloading ? tr("Скачивается…") : tr("Скачать")}</button>
          </div>
          <button type="button" className="toolbar-icon" onClick={onClose} aria-label={tr("Закрыть")}><X size={18} /></button>
        </div>
        <div className="project-detail-stats">
          <span><ArrowDownToLine size={14} />{new Intl.NumberFormat(activeLanguage === 'en' ? 'en-US' : 'ru-RU').format(project.downloads)} {tr("загрузок")}</span>
          {details && <><span>{details.versions.length} {tr("версий")}</span><span>{tr("Обновлено")}{' '}{date(details.updated)}</span></>}
        </div>
        {details && project.project_type !== 'modpack' && !compatibleVersion && target && <p className="compatibility-warning">{tr("Нет подходящей версии для Minecraft")}{' '}{target.minecraftVersion} · {target.loader}.</p>}
        <div className="project-detail-tabs">
          {([['overview', tr("Обзор")], ['gallery', tr("Картинки")], ['versions', tr("Версии")]] as Array<[ProjectDetailTab, string]>).map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        {error ? <div className="error-panel">{tr(error)}</div> : !details ? <div className="loading-state">{tr("Загружаем информацию о проекте…")}</div> : (
          <div className="project-detail-content">
            {tab === 'overview' && (
              <div className="project-description">
                <p className="project-summary">{details.description}</p>
                <MarkdownContent content={details.body || tr("Автор не добавил подробное описание.")} />
              </div>
            )}
            {tab === 'gallery' && (
              details.gallery.length ? <div className="project-gallery">{details.gallery.map((image) => (
                <figure key={image.url}><img src={image.url} alt={image.title ?? project.title} /><figcaption>{image.title || image.description || project.title}</figcaption></figure>
              ))}</div> : <div className="no-results">{tr("Автор не добавил изображения.")}</div>
            )}
            {tab === 'versions' && (
              details.versions.length ? <div className="project-version-list">{details.versions.map((version) => (
                <div className="project-version glass-panel" key={version.id}>
                  <div><strong>{version.name || version.version_number}</strong><span>{version.version_number} · {version.loaders.join(', ') || 'Vanilla'} · Minecraft {version.game_versions.slice(0, 4).join(', ') || '—'}</span>{version.dependencies.some((dependency) => dependency.dependency_type === 'required') && <small className="required-dependencies">{tr("Обязательные зависимости:")}{' '}{version.dependencies.filter((dependency) => dependency.dependency_type === 'required').map((dependency) => dependency.file_name || dependency.project_id || dependency.version_id || tr("неизвестно")).join(', ')}</small>}</div>
                  <small>{date(version.date_published)}</small>
                </div>
              ))}</div> : <div className="no-results">{tr("Версии не найдены.")}</div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

type SettingsSection = 'minecraft' | 'launcher' | 'appearance'

function SettingsPage({ settings, memoryLimitMb, launcherPath, minecraftPath, onSave, onLanguageChange, onMessage, onMinecraftPathChange }: {
  settings: LauncherSettings
  memoryLimitMb: number
  launcherPath: string
  minecraftPath: string
  onSave(patch: Partial<LauncherSettings>): Promise<boolean>
  onLanguageChange(language: LauncherSettings['launcherLanguage']): Promise<boolean>
  onMessage(message: string): void
  onMinecraftPathChange(minecraftPath: string, instancesPath: string): void
}) {
  const [section, setSection] = useState<SettingsSection>('minecraft')
  const [draft, setDraft] = useState(settings)
  const [memoryText, setMemoryText] = useState(String(settings.memoryMb))
  useEffect(() => setMemoryText(String(settings.memoryMb)), [settings.memoryMb])
  const memoryStops = [512, 2048, 4096, 8192, 12288, 16384, 24576, 32768, 49152, 65536]
    .filter((value) => value <= memoryLimitMb)
  const recommendedMemory = Math.min(memoryLimitMb, Math.max(512, Math.floor(memoryLimitMb / 2 / 512) * 512))
  const setMemory = (value: number) => {
    const next = Math.min(memoryLimitMb, Math.max(512, Math.round(value)))
    setMemoryText(String(next))
    update('memoryMb', next)
  }
  const commitMemoryText = () => setMemory(Number(memoryText) || recommendedMemory)
  const update = <K extends keyof LauncherSettings>(key: K, value: LauncherSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  return (
    <div className="content-page settings-page">
      <div className="page-heading-row"><div><span className="eyebrow-small">{tr("КОНФИГУРАЦИЯ")}</span><h1>{tr("Настройки")}</h1><p>{tr("Параметры игры, поведения лаунчера и оформления.")}</p></div></div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={tr("Разделы настроек")}>
          <button className={section === 'minecraft' ? 'active' : ''} onClick={() => setSection('minecraft')}><Gamepad2 size={17} />{tr("Запуск Minecraft")}</button>
          <button className={section === 'launcher' ? 'active' : ''} onClick={() => setSection('launcher')}><Settings2 size={17} />{tr("Настройки лаунчера")}</button>
          <button className={section === 'appearance' ? 'active' : ''} onClick={() => setSection('appearance')}><Sparkles size={17} />{tr("Внешний вид")}</button>
        </nav>

        <div className="settings-content">
          {section === 'minecraft' && (
            <>
              <section className="settings-group glass-panel">
                <div className="settings-title"><HardDrive size={18} /><div><strong>{tr("Игровая директория")}</strong></div></div>
                <div className="location-row"><span>Launcher</span><code>{launcherPath || tr("Загружается…")}</code></div>
                <div className="path-row"><span>Minecraft</span><code>{minecraftPath || tr("Загружается…")}</code><button className="outline-button" onClick={() => void window.nexium.chooseInstancesFolder().then((folder) => { update('instancesPath', folder.instancesPath); onMinecraftPathChange(folder.minecraftPath, folder.instancesPath) })}><FolderOpen size={15} />{tr("Изменить")}</button></div>
              </section>
              <section className="settings-group glass-panel">
                <div className="settings-title"><LayoutGrid size={18} /><div><strong>{tr("Список версий")}</strong></div></div>
                <div className="toggle-list">
                  <ToggleSetting label={tr("Модифицированные версии")} value={draft.showModified} onChange={(value) => update('showModified', value)} />
                  <ToggleSetting label={tr("Снапшоты")} value={draft.showSnapshots} onChange={(value) => update('showSnapshots', value)} />
                  <ToggleSetting label={tr("Релизы старше 1.5.2")} value={draft.showOldReleases} onChange={(value) => update('showOldReleases', value)} />
                  <ToggleSetting label={tr("Бета-версии")} value={draft.showBetas} onChange={(value) => update('showBetas', value)} />
                  <ToggleSetting label={tr("Альфа-версии")} value={draft.showAlphas} onChange={(value) => update('showAlphas', value)} />
                </div>
              </section>
              <section className="settings-group glass-panel">
                <div className="settings-title"><Sparkles size={18} /><div><strong>{tr("Java и память")}</strong><span>{tr("Параметры виртуальной машины для Minecraft")}</span></div></div>
                <label className="field-label" htmlFor="java-path">Java</label>
                <div className="java-picker"><CustomSelect ariaLabel={tr("Выбор Java")} value={draft.javaPath ? 'custom' : 'default'} options={[{ value: 'default', label: tr("Автоматически") }, ...(draft.javaPath ? [{ value: 'custom', label: draft.javaPath }] : [])]} onChange={(value) => { if (value === 'default') update('javaPath', '') }} /><button className="outline-button" onClick={() => void window.nexium.chooseJava().then((javaPath) => { if (javaPath) update('javaPath', javaPath) }).catch((error: Error) => onMessage(tr(error.message)))}><FolderOpen size={15} />{tr("Изменить")}</button></div>
                <p className="field-hint">{tr("Автоматически — лаунчер найдёт установленную Java нужной версии, а если её нет, скачает официальный рантайм Mojang.")}</p>
                <label className="field-label memory-label" htmlFor="memory-mb">{tr("Выделенная память, МБ (доступно до")}{' '}{memoryLimitMb.toLocaleString(activeLanguage === 'en' ? 'en-US' : 'ru-RU')} {tr("МБ)")}</label>
                <div className="memory-controls">
                  <input className="memory-slider" type="range" min={512} max={memoryLimitMb} step={512} value={Math.min(memoryLimitMb, Math.max(512, draft.memoryMb))} onChange={(event) => setMemory(Number(event.target.value))} aria-label={tr("Выделенная память")} />
                  <input className="settings-input memory-input" id="memory-mb" type="number" min={512} max={memoryLimitMb} step={1} value={memoryText} onChange={(event) => {
                    const value = event.target.value
                    setMemoryText(value)
                    const number = Number(value)
                    if (Number.isFinite(number) && number >= 512) update('memoryMb', Math.min(memoryLimitMb, number))
                  }} onBlur={commitMemoryText} />
                  <button className="outline-button" onClick={() => setMemory(recommendedMemory)}>{tr("Рекомендованно:")}{' '}{recommendedMemory.toLocaleString(activeLanguage === 'en' ? 'en-US' : 'ru-RU')} {tr("МБ")}</button>
                </div>
                <div className="memory-presets">{memoryStops.map((value) => <button key={value} className={draft.memoryMb === value ? 'active' : ''} onClick={() => setMemory(value)}>{value >= 1024 ? `${value / 1024} ГБ` : `${value} МБ`}</button>)}{!memoryStops.includes(memoryLimitMb) && <button onClick={() => setMemory(memoryLimitMb)}>{tr("Макс.")}{' '}{memoryLimitMb >= 1024 ? `${(memoryLimitMb / 1024).toFixed(1)} ГБ` : `${memoryLimitMb} МБ`}</button>}</div>
                <label className="checkbox-setting"><input type="checkbox" checked={draft.useLauncherLanguage} onChange={(event) => update('useLauncherLanguage', event.target.checked)} /><span className="toggle-switch" aria-hidden="true" /><span>{tr("Использовать язык лаунчера в Minecraft")}</span></label>
                {!draft.useLauncherLanguage && <CustomSelect ariaLabel={tr("Язык Minecraft")} value={draft.minecraftLanguage} options={[{ value: 'ru_RU', label: tr("Русский") }, { value: 'en_US', label: 'English' }]} onChange={(value) => update('minecraftLanguage', value)} />}
              </section>
              <section className="settings-group glass-panel">
                <div className="settings-title"><Pencil size={18} /><div><strong>{tr("Аргументы Minecraft")}</strong><span>{tr("Дополнительные JVM-аргументы запуска")}</span></div></div>
                <textarea className="settings-input settings-textarea" value={draft.minecraftArguments} onChange={(event) => update('minecraftArguments', event.target.value)} placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=50" />
              </section>
            </>
          )}

          {section === 'launcher' && (
            <>
              <section className="settings-group glass-panel">
                <div className="settings-title"><Settings2 size={18} /><div><strong>{tr("Поведение и подключение")}</strong></div></div>
                <SettingSelect label={tr("Консоль разработчика")} value={draft.developerConsole} onChange={(value) => update('developerConsole', value as LauncherSettings['developerConsole'])} options={[['off', tr("Отключена")], ['shared', tr("Общая")]]} />
                <SettingSelect label={tr("Качество соединения")} value={draft.connectionQuality} onChange={(value) => update('connectionQuality', value as LauncherSettings['connectionQuality'])} options={[['good', tr("Хорошее")], ['normal', tr("Нормальное")], ['poor', tr("Плохое")]]} />
                <SettingSelect label={tr("После запуска игры")} value={draft.launchBehavior} onChange={(value) => update('launchBehavior', value as LauncherSettings['launchBehavior'])} options={[['hide', tr("Скрывать лаунчер")], ['close', tr("Закрывать лаунчер")], ['keep', tr("Ничего не делать")]]} />
              </section>
              <section className="settings-group glass-panel">
                <div className="settings-title"><UserRound size={18} /><div><strong>{tr("Язык интерфейса")}</strong></div></div>
                <SettingSelect label={tr("Язык")} value={draft.launcherLanguage} onChange={(value) => {
                  const nextLanguage = value as LauncherSettings['launcherLanguage']
                  update('launcherLanguage', nextLanguage)
                  void onLanguageChange(nextLanguage).then((saved) => {
                    if (!saved) update('launcherLanguage', settings.launcherLanguage)
                  })
                }} options={[['ru', tr("Русский")], ['en', 'English']]} />
              </section>
            </>
          )}

          {section === 'appearance' && (
            <>
              <section className="settings-group glass-panel">
                <div className="settings-title"><Sparkles size={18} /><div><strong>{tr("Discord Rich Presence")}</strong><span>{tr("Показывать в Discord открытую вкладку и активную сборку.")}</span></div></div>
                <ToggleSetting label={tr("Discord Rich Presence")} value={draft.discordRpc} onChange={(value) => update('discordRpc', value)} />
              </section>
              <section className="settings-group glass-panel">
                <div className="settings-title"><Sparkles size={18} /><div><strong>Liquid Glass</strong><span>{tr("Один ползунок плотности материала, как в прежнем варианте")}</span></div></div>
                <label className="slider-setting">
                  <span>{tr("Прозрачность стекла")}</span><strong>{draft.glassStrength}%</strong>
                  <input type="range" min={0} max={100} value={draft.glassStrength} onChange={(event) => update('glassStrength', Number(event.target.value))} />
                </label>
              </section>
              <section className="settings-group glass-panel">
                <div className="settings-title"><HardDrive size={18} /><div><strong>{tr("Фон приложения")}</strong><span>{tr("Свой фон масштабируется под окно лаунчера")}</span></div></div>
                <div className="path-row"><code>{draft.backgroundPath ? (draft.backgroundKind === 'video' ? tr("Пользовательское видео выбрано") : tr("Пользовательское изображение выбрано")) : tr("Фон fon.jpg")}</code><button className="outline-button" onClick={() => void window.nexium.chooseBackground().then((background) => { if (background) { update('backgroundPath', background.path); update('backgroundKind', background.kind) } }).catch((error: Error) => onMessage(tr(error.message)))}><FolderOpen size={15} />{tr("Выбрать файл")}</button></div>
                <p className="settings-footnote">{tr("Изображение или MP4-видео длительностью до 5 секунд.")}</p>
              </section>
            </>
          )}

          <div className="settings-actions">
            <button className="quiet-button" onClick={() => setDraft(settings)}>{tr("Отменить")}</button>
            <button className="primary-button compact" onClick={() => void onSave(draft)}>{tr("Сохранить")}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleSetting({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange(value: boolean): void }) {
  return (
    <label className="toggle-setting">
      <span><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-switch" aria-hidden="true" />
    </label>
  )
}

function SettingSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: Array<[string, string]>
  onChange(value: string): void
}) {
  return (
    <label className="setting-select-row"><span>{label}</span><CustomSelect ariaLabel={label} value={value} options={options.map(([key, text]) => ({ value: key, label: text }))} onChange={onChange} /></label>
  )
}

function ProfileDialog({ settings, onClose, onSave }: {
  settings: LauncherSettings
  onClose(): void
  onSave(patch: Partial<LauncherSettings>): Promise<boolean>
}) {
  const [name, setName] = useState(settings.playerName)
  const [error, setError] = useState('')
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="create-modal profile-modal glass-panel">
        <div className="modal-heading"><div><span className="eyebrow-small">{tr("АККАУНТЫ И ИГРОК")}</span><h2>{tr("Игровой профиль")}</h2></div><button type="button" className="toolbar-icon" onClick={onClose} aria-label={tr("Закрыть")}><X size={18} /></button></div>
        <div className="profile-current"><span className="avatar"><UserRound size={20} /></span><div><strong>{settings.playerName}</strong><span>{settings.accountType === 'local' ? tr("Локальный профиль") : 'NEXIUM'}</span></div></div>
        <label className="field-label" htmlFor="profile-name">{tr("Игровой никнейм (3–16 символов A–Z, 0–9, _)")}</label>
        <div className="field-row"><input id="profile-name" value={name} maxLength={16} onChange={(event) => setName(event.target.value)} /><button className="outline-button" onClick={() => void onSave({ playerName: name, accountType: 'local' }).then((saved) => { if (saved) onClose(); else setError(tr("Проверьте никнейм и попробуйте снова.")) })}>{tr("Сохранить")}</button></div>
        {error && <p className="form-error">{error}</p>}
        <div className="account-actions">
          <button className="account-option" onClick={() => setError(tr("Сервис учётных записей NEXIUM ещё не создан."))}><span className="account-option-mark nexium-mark"><img src="./nexium-logo.png" alt="" /></span><span><strong>{tr("Войти с NEXIUM")}</strong></span><ChevronRight size={16} /></button>
        </div>
      </section>
    </div>
  )
}

type ProfileSection = 'viewed' | 'comments' | 'likes' | 'followers' | 'following' | 'modpacks'

function PlayerProfilePage({ settings, onBack, onSave }: {
  settings: LauncherSettings
  onBack(): void
  onSave(patch: Partial<LauncherSettings>): Promise<boolean>
}) {
  const [displayName, setDisplayName] = useState(settings.displayName)
  const [bio, setBio] = useState(settings.profileBio)
  const [avatar, setAvatar] = useState(settings.profileAvatar)
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState<ProfileSection>('viewed')
  const shownName = displayName.trim() || settings.playerName
  const profileSections: Array<{ id: ProfileSection; label: string }> = [
    { id: 'viewed', label: tr("Просмотренное") },
    { id: 'comments', label: tr("Мои комментарии") },
    { id: 'likes', label: tr("Мои лайки") },
    { id: 'followers', label: tr("Мои подписчики") },
    { id: 'following', label: tr("Мои подписки") },
    { id: 'modpacks', label: tr("Мои сборки") },
  ]
  const activeLabel = profileSections.find((section) => section.id === activeSection)?.label ?? ''

  async function saveProfile() {
    setSaving(true)
    await onSave({ displayName, profileBio: bio, profileAvatar: avatar })
    setSaving(false)
  }

  return (
    <div className="content-page player-profile-page">
      <div className="page-heading-row"><div><span className="eyebrow-small">{tr("ЛИЧНАЯ СТРАНИЦА")}</span><h1>{shownName}</h1></div><button className="quiet-button" onClick={onBack}><ChevronLeft size={16} />{tr("Назад")}</button></div>
      <section className="player-profile-cover glass-panel">
        <div className="player-profile-header">
          <span className="avatar profile-avatar-large">{avatar ? <img src={avatar} alt="" /> : <UserRound size={28} />}</span>
          <div><div className="profile-name-badges"><strong>{shownName}</strong>{settings.profileBadges.map((badge) => <VerificationBadge key={badge} badge={badge} />)}</div><span>{tr("Игровой ник:")}{' '}{settings.playerName} · {tr("Локальный профиль")}</span></div>
          <button className="outline-button" onClick={() => void window.nexium.chooseAvatar().then((path) => { if (path) setAvatar(path) }).catch((error: Error) => window.alert(tr(error.message)))}><FolderOpen size={14} />{tr("Изменить аватар")}</button>
        </div>
        {bio && <p className="profile-bio-preview">{bio}</p>}
        <div className="profile-stats" aria-label={tr("Статистика профиля")}>
          {[
            [tr("Просмотры"), '—'],
            [tr("Комментарии"), '—'],
            [tr("Лайки"), '—'],
            [tr("Подписчики"), '—'],
            [tr("Подписки"), '—'],
          ].map(([label, value]) => <div className="profile-stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}
        </div>
        <p className="profile-stats-note">{tr("Счётчики появятся после подключения аккаунта сообщества.")}</p>
      </section>
      <section className="profile-edit-panel glass-panel">
        <div><span className="eyebrow-small">{tr("О СЕБЕ")}</span><h2>{tr("Настрой свою страницу")}</h2></div>
        <label className="field-label" htmlFor="visual-name">{tr("Визуальный никнейм")}</label>
        <input className="profile-text-input" id="visual-name" maxLength={32} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={settings.playerName} />
        <label className="field-label" htmlFor="profile-bio">{tr("Био")}</label>
        <textarea className="settings-input profile-bio" id="profile-bio" maxLength={280} value={bio} onChange={(event) => setBio(event.target.value)} placeholder={tr("Расскажи немного о себе")} />
        <div className="profile-page-actions"><span>{tr("До 280 символов")}</span><button className="primary-button compact" disabled={saving} onClick={() => void saveProfile()}>{tr("Сохранить профиль")}</button></div>
      </section>
      <nav className="profile-page-tabs" aria-label={tr("Разделы профиля")}>
        {profileSections.map((section) => <button type="button" key={section.id} className={activeSection === section.id ? 'active' : ''} aria-current={activeSection === section.id ? 'page' : undefined} onClick={() => setActiveSection(section.id)}>{section.label}</button>)}
      </nav>
      <section className="profile-page-panel profile-activity glass-panel">
        <div><span className="eyebrow-small">{activeSection === 'modpacks' ? tr("Опубликованные сборки") : tr("Просмотренная активность")}</span><h2>{activeLabel}</h2></div>
        <div className="profile-empty-state">
          <strong>{tr("В сообществе пока нет данных для этого раздела.")}</strong>
          <p>{tr("Счётчики появятся после подключения аккаунта сообщества.")}</p>
        </div>
      </section>
    </div>
  )
}

function RenameInstanceDialog({ instance, onClose, onSave }: {
  instance: InstanceRecord
  onClose(): void
  onSave(name: string): void
}) {
  const [name, setName] = useState(instance.name)
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="create-modal glass-panel" onSubmit={(event) => { event.preventDefault(); onSave(name.trim()) }}>
        <div className="modal-heading"><div><span className="eyebrow-small">{tr("БИБЛИОТЕКА")}</span><h2>{tr("Переименовать")}</h2></div><button type="button" className="toolbar-icon" onClick={onClose} aria-label={tr("Закрыть")}><X size={18} /></button></div>
        <label className="field-label" htmlFor="rename-instance">{tr("Название сборки")}</label>
        <input id="rename-instance" autoFocus required maxLength={40} value={name} onChange={(event) => setName(event.target.value)} />
        <div className="modal-actions"><button type="button" className="quiet-button" onClick={onClose}>{tr("Отмена")}</button><button type="submit" className="primary-button compact">{tr("Сохранить")}</button></div>
      </form>
    </div>
  )
}

function CommunityPage() {
  return (
    <div className="content-page community-page">
      <div className="page-heading-row">
        <div><span className="eyebrow-small">{tr("СБОРКИ ИГРОКОВ")}</span><h1>{tr("Каталог пользовательских сборок")}</h1><p>{tr("Сборки проходят модерацию перед публикацией. Одобренные проекты будут доступны здесь.")}</p></div>
        <button className="primary-button compact" disabled title={tr("Отправка сборок станет доступна после подключения сервера сообщества.")}><Plus size={16} />{tr("Предложить сборку на модерацию")}</button>
      </div>
      <section className="community-hero glass-panel">
        <span className="community-icon"><MessageCircle size={22} /></span>
        <div><span className="eyebrow-small">{tr("МОДЕРАЦИЯ")}</span><h2>{tr("Сборки игроков")}</h2><p>{tr("Сборки проходят модерацию перед публикацией. Одобренные проекты будут доступны здесь.")}</p></div>
      </section>
      <section className="community-catalog glass-panel">
        <div className="community-catalog-heading"><div><span className="eyebrow-small">{tr("СООБЩЕСТВО")}</span><h2>{tr("Опубликованные сборки")}</h2></div><span className="community-status">{tr("МОДЕРАЦИЯ")}</span></div>
        <div className="community-empty-state"><Box size={24} /><strong>{tr("Каталог пока пуст")}</strong><span>{tr("Одобренные модерацией сборки появятся здесь.")}</span></div>
      </section>
      <p className="community-service-note">{tr("Отправка сборок станет доступна после подключения сервера сообщества.")}</p>
    </div>
  )
}

function CreateInstanceModal({ versions, onClose, onCreate }: {
  versions: MinecraftVersion[]
  onClose(): void
  onCreate(input: InstanceInput): void
}) {
  const [name, setName] = useState('')
  const latestRelease = versions.find((version) => version.type === 'release')?.id ?? '1.21.4'
  const [minecraftVersion, setMinecraftVersion] = useState(latestRelease)
  const [loader, setLoader] = useState('Vanilla')
  const [loaderChoices, setLoaderChoices] = useState<Array<{ loader: string; version: string }>>([{ loader: 'Vanilla', version: 'vanilla' }])
  const [loaderError, setLoaderError] = useState('')
  useEffect(() => {
    if (versions.length && minecraftVersion === '1.21.4') setMinecraftVersion(latestRelease)
  }, [latestRelease, minecraftVersion, versions.length])
  useEffect(() => {
    let active = true
    setLoaderError('')
    void window.nexium.listLoaders(minecraftVersion).then((choices) => {
      if (!active) return
      setLoaderChoices(choices)
      if (!choices.some((choice) => choice.loader === loader)) setLoader('Vanilla')
    }).catch((error: unknown) => {
      if (!active) return
      setLoaderChoices([{ loader: 'Vanilla', version: 'vanilla' }])
      setLoaderError(error instanceof Error ? error.message : tr("Не удалось проверить загрузчики."))
    })
    return () => { active = false }
  }, [minecraftVersion])
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="create-modal glass-panel" onSubmit={(event) => { event.preventDefault(); onCreate({ name, minecraftVersion, loader }) }}>
        <div className="modal-heading"><div><span className="eyebrow-small">{tr("НОВАЯ ИГРОВАЯ ПАПКА")}</span><h2>{tr("Создать сборку")}</h2></div><button type="button" className="toolbar-icon" onClick={onClose} aria-label={tr("Закрыть")}><X size={18} /></button></div>
        <label className="field-label" htmlFor="instance-name">{tr("Название")}</label>
        <input id="instance-name" autoFocus required maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder={tr("Например, Выживание с друзьями")} />
        <div className="modal-two-col">
          <label><span className="field-label">{tr("Версия Minecraft")}</span><CustomSelect ariaLabel={tr("Версия Minecraft")} value={minecraftVersion} options={versions.filter((version) => version.type === 'release').map((version) => ({ value: version.id, label: version.id })).concat(!versions.length ? [{ value: '1.21.4', label: '1.21.4' }] : [])} onChange={setMinecraftVersion} /></label>
          <label><span className="field-label">{tr("Загрузчик")}</span><CustomSelect ariaLabel={tr("Загрузчик Minecraft")} value={loader} options={loaderChoices.map(({ loader: value, version }) => ({ value, label: value === 'Vanilla' ? value : `${value} · ${version}` }))} onChange={setLoader} /></label>
        </div>
        {loaderError && <p className="field-error" role="alert">{loaderError}</p>}
        <div className="modal-actions"><button type="button" className="quiet-button" onClick={onClose}>{tr("Отмена")}</button><button type="submit" className="primary-button compact"><Plus size={16} />{tr("Создать папку")}</button></div>
      </form>
    </div>
  )
}

function pluralInstances(count: number) {
  if (count === 1) return tr("сборка")
  if (count > 1 && count < 5) return tr("сборки")
  return tr("сборок")
}

export default App
