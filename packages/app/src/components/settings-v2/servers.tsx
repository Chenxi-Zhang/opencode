import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import fuzzysort from "fuzzysort"
import { type Component, For, Show, createMemo, createResource, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { ServerRowMenu } from "@/components/server/server-row-menu"
import { ServerHealthIndicator } from "@/components/server/server-row"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { ServerConnection, serverName } from "@/context/server"
import { showToast } from "@/utils/toast"
import { useServerManagementController } from "../dialog-select-server"
import { DialogServerV2 } from "./dialog-server-v2"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { isWslServer, useFilteredWslServers, WslAddServerButton, WslServerSettings } from "@/wsl/settings"
import "./settings-v2.css"

export const SettingsServersV2: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const controller = useServerManagementController()
  const [store, setStore] = createStore({ filter: "" })
  const wslServers = useFilteredWslServers(() => store.filter)

  const isWindows = platform.os === "windows"

  const showSearch = createMemo(
    () => controller.sortedItems().filter((item) => !isWslServer(item)).length + wslServers().length > 1,
  )

  const filtered = createMemo(() => {
    const items = controller.sortedItems().filter((item) => !isWslServer(item))
    const query = store.filter.trim()
    if (!query) return items
    return fuzzysort
      .go(query, items, {
        keys: [(item) => serverName(item), (item) => item.http.url],
      })
      .map((result) => result.obj)
  })

  const openAdd = () => {
    dialog.push(() => <DialogServerV2 mode="add" />)
  }

  const openEdit = (server: ServerConnection.Http) => {
    dialog.push(() => <DialogServerV2 mode="edit" server={server} />)
  }

  return (
    <>
      <div
        class="settings-v2-tab-header settings-v2-servers-header"
        classList={{ "settings-v2-tab-header--stacked": showSearch() }}
      >
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("status.popover.tab.servers")}</h2>
          <ButtonV2 variant="ghost-muted" icon="plus" onClick={openAdd}>
            {language.t("dialog.server.add.button")}
          </ButtonV2>
          <WslAddServerButton />
        </div>
        <Show when={showSearch()}>
          <div class="settings-v2-tab-search">
            <TextInputV2
              type="search"
              appearance="base"
              value={store.filter}
              onInput={(event) => setStore("filter", event.currentTarget.value)}
              placeholder={language.t("dialog.server.search.placeholder")}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              aria-label={language.t("dialog.server.search.placeholder")}
            />
            <Show when={store.filter}>
              <IconButtonV2
                type="button"
                variant="ghost-muted"
                size="small"
                class="settings-v2-tab-search-clear"
                icon={<IconV2 name="close" size="large" class="text-v2-icon-icon-muted" />}
                onClick={() => setStore("filter", "")}
              />
            </Show>
          </div>
        </Show>
      </div>

      <div class="settings-v2-tab-body settings-v2-servers">
        <Show
          when={filtered().length > 0 || wslServers().length > 0}
          fallback={
            <div class="settings-v2-servers-status">
              <span>{store.filter ? language.t("palette.empty") : language.t("dialog.server.empty")}</span>
              <Show when={store.filter}>
                <span class="settings-v2-servers-status-filter">&quot;{store.filter}&quot;</span>
              </Show>
            </div>
          }
        >
          <SettingsListV2>
            <WslServerSettings controller={controller} servers={wslServers} />
            <For each={filtered()}>
              {(item) => {
                const key = ServerConnection.key(item)
                const health = () => controller.status()[key]
                const isDefault = () => controller.defaultKey() === key
                return (
                  <div class="settings-v2-servers-row">
                    <div class="settings-v2-servers-lead">
                      <ServerHealthIndicator health={health()} />
                      <div class="settings-v2-servers-copy">
                        <span class="settings-v2-servers-name">{serverName(item)}</span>
                        <span class="settings-v2-servers-meta">
                          <Show when={health()?.version}>v{health()?.version}</Show>
                          <Show when={health()?.version && item.type === "http"}> • </Show>
                          <Show
                            when={item.type === "http" && item.http.username}
                            fallback={<Show when={item.type === "http"}>{language.t("server.row.noUsername")}</Show>}
                          >
                            {item.http.username}
                          </Show>
                        </span>
                      </div>
                    </div>
                    <div class="settings-v2-servers-actions">
                      <Show when={controller.canDefault() && isDefault()}>
                        <Tag>{language.t("dialog.server.status.default")}</Tag>
                      </Show>
                      <ServerRowMenu server={item} controller={controller} onEdit={openEdit} />
                    </div>
                  </div>
                )
              }}
            </For>
          </SettingsListV2>
        </Show>
        <Show when={isWindows}>
          <NativeServerBinarySection />
        </Show>
      </div>
    </>
  )
}

function NativeServerBinarySection() {
  const language = useLanguage()
  const platform = usePlatform()
  const [binary, { refetch: refetchBinary }] = createResource(
    () => platform.getNativeServerBinary?.() ?? null,
  )
  const [picking, setPicking] = createSignal(false)

  const pick = async () => {
    setPicking(true)
    try {
      const result = await platform.pickNativeServerBinary?.()
      if (result) {
        await refetchBinary()
        showToast({
          variant: "success",
          title: language.t("settings.desktop.nativeBinary.toast.title"),
          description: language.t("settings.desktop.nativeBinary.toast.description"),
        })
      }
    } catch {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
      })
    } finally {
      setPicking(false)
    }
  }

  const clear = async () => {
    await platform.setNativeServerBinary?.(null)
    await refetchBinary()
  }

  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.desktop.nativeBinary.title")}</h3>
      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.desktop.nativeBinary.row.title")}
          description={
            binary()
              ? binary()
              : language.t("settings.desktop.nativeBinary.row.description")
          }
        >
          <div class="flex items-center gap-2">
            <ButtonV2 variant="neutral" size="small" onClick={pick} disabled={picking()}>
              {picking()
                ? language.t("settings.desktop.nativeBinary.picking")
                : binary()
                  ? language.t("settings.desktop.nativeBinary.change")
                  : language.t("settings.desktop.nativeBinary.select")}
            </ButtonV2>
            <Show when={binary()}>
              <ButtonV2 variant="ghost-muted" size="small" onClick={clear}>
                {language.t("settings.desktop.nativeBinary.clear")}
              </ButtonV2>
            </Show>
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}
