import { defineComponent, h } from 'vue'
import { OhVueIcon, addIcons } from 'oh-vue-icons'
import { gameIconsReady, loadGameIcons } from '~/utils/gameIcons'
import {
  MdArrowback, MdArrowforward,
  MdAdd, MdAddcircleoutline, MdDelete, MdDeleteOutlined, MdEdit, MdEditnote,
  MdClose, MdSort, MdMap,
  MdVisibility, MdVisibilityoff,
  MdCloud, MdSunny, MdAccesstime,
  MdShield, MdShieldOutlined,
  MdHistory, MdAutoawesome,
  MdDesktopmac, MdSettings,
  MdViewmodule, MdMenubook,
  MdDraghandle, MdArrowdropdown,
  MdChevronleft, MdChevronright,
  MdFiledownload, MdFileupload, MdWarningamber,
  MdBrightness4, MdAnimation, MdStorage,
  MdContentcopy, MdCheck, MdAutorenew,
  MdBookmark, MdBookmarkborder, MdBookmarkadded, MdOpeninnew, MdPushpin,
  MdLink, MdFitscreen, MdOpeninfull,
  MdLock, MdPrint, MdTune,
} from 'oh-vue-icons/icons/md'

import {
  FaEye, FaEyeSlash,
  FaSkull, FaSkullCrossbones,
  FaDesktop, FaSearch, FaFolderOpen,
  FaDragon, FaFeatherAlt, FaDice,
  FaDiceD20, FaShapes,
} from 'oh-vue-icons/icons/fa'

// Add MD and FA icons individually
addIcons(
  MdArrowback, MdArrowforward,
  MdAdd, MdAddcircleoutline, MdDelete, MdDeleteOutlined, MdEdit, MdEditnote,
  MdClose, MdSort, MdMap,
  MdVisibility, MdVisibilityoff,
  MdCloud, MdSunny, MdAccesstime,
  MdShield, MdShieldOutlined,
  MdHistory, MdAutoawesome,
  MdDesktopmac, MdSettings,
  MdViewmodule, MdMenubook,
  MdDraghandle, MdArrowdropdown,
  MdChevronleft, MdChevronright,
  MdFiledownload, MdFileupload, MdWarningamber,
  MdBrightness4, MdAnimation, MdStorage, MdContentcopy, MdCheck, MdAutorenew,
  MdBookmark, MdBookmarkborder, MdBookmarkadded, MdOpeninnew, MdPushpin,
  MdLink, MdFitscreen, MdOpeninfull,
  MdLock, MdPrint, MdTune,
  FaEye, FaEyeSlash,
  FaSkull, FaSkullCrossbones,
  FaDesktop, FaSearch, FaFolderOpen,
  FaDragon, FaFeatherAlt, FaDice,
  FaDiceD20, FaShapes,
)

/**
 * OhVueIcon's registry isn't reactive, so a gi-* icon used before its chunk
 * arrives would stay blank. This wrapper renders it once the set is there.
 */
const Icon = defineComponent({
  name: 'OhVueIcon',
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => {
      const name = attrs.name as string | undefined
      const waiting = !!name?.startsWith('gi-') && !gameIconsReady.value
      return h(OhVueIcon, { ...attrs, name: waiting ? undefined : name })
    }
  },
})

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component('OhVueIcon', Icon)
  loadGameIcons()
})
