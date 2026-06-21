import { Mod, ModManager } from './mod-manager';

class ModOperations {
  modManager: ModManager;

  constructor(modManager: ModManager) {
    this.modManager = modManager;
  }

  getUniqueMods(mods: Mod[]) {
    return mods.filter(
      (mod, index, allMods) =>
        allMods.findIndex(
          (candidate) =>
            candidate.id === mod.id ||
            (candidate.path && candidate.path === mod.path),
        ) === index,
    );
  }

  async deleteMods(mods: Mod[]) {
    const failedMods: Array<{ mod: Mod; error: string }> = [];
    let successCount = 0;

    for (const mod of mods) {
      if (!mod.path) {
        failedMods.push({
          mod,
          error: 'Missing mod path',
        });
        continue;
      }

      if (!window.electronAPI?.deleteMod) {
        failedMods.push({
          mod,
          error: 'deleteMod API unavailable',
        });
        continue;
      }

      const result = await window.electronAPI.deleteMod(mod.path);

      if (result.success) {
        successCount++;
        this.modManager.removeModFromSelection(mod.id);
      } else {
        failedMods.push({
          mod,
          error: result.error || 'Unknown error',
        });
      }
    }

    return { successCount, failedMods };
  }

  async renameMod(mod: Mod) {
    if (!mod.path) {
      if (window.toastManager) {
        window.toastManager.error(
          'Cannot rename this mod - folder path not found',
        );
      }
      return;
    }

    if (window.modalManager) {
      window.modalManager.openRenameModal(mod, async (newName) => {
        if (window.electronAPI && window.electronAPI.renameMod) {
          const result = await window.electronAPI.renameMod(mod.path, newName);

          if (result.success) {
            console.log('Mod renamed successfully');
            if (window.toastManager) {
              window.toastManager.success('toasts.modRenamed', 3000, {
                name: newName,
              });
            }

            this.modManager.fetchMods();
          } else {
            if (window.toastManager) {
              window.toastManager.error('toasts.failedToRenameMod', 3000, {
                error: result.error,
              });
            }
          }
        }
      });
    }
  }

  async toggleModStatus(mod: Mod) {
    if (!mod.path || !this.modManager.modsPath) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotToggleModStatus');
      }
      return;
    }

    if (window.electronAPI && window.electronAPI.toggleMod) {
      const result = await window.electronAPI.toggleMod(
        mod.path,
        this.modManager.modsPath,
      );

      if (result.success) {
        console.log(
          `Mod ${result.isNowActive ? 'enabled' : 'disabled'} successfully`,
        );
        if (window.toastManager) {
          window.toastManager.success(
            result.isNowActive ? 'toasts.modEnabled' : 'toasts.modDisabled',
          );
        }

        this.modManager.fetchMods();
      } else {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToToggleMod', 3000, {
            error: result.error,
          });
        }
      }
    }
  }

  async toggleModsStatus(
    mods: Mod[],
    targetStatus?: 'active' | 'disabled',
  ) {
    const uniqueMods = this.getUniqueMods(mods).filter((mod) => !!mod.path);

    if (uniqueMods.length === 0 || !this.modManager.modsPath) {
      window.toastManager?.error('toasts.cannotToggleModStatus');
      return;
    }

    if (uniqueMods.length === 1) {
      await this.toggleModStatus(uniqueMods[0]);
      return;
    }

    const nextStatus =
      targetStatus ||
      (uniqueMods[0].status === 'disabled' ? 'active' : 'disabled');
    const modsToToggle = uniqueMods.filter((mod) => mod.status !== nextStatus);

    if (modsToToggle.length === 0) {
      window.toastManager?.success(
        nextStatus === 'active' ? 'toasts.modsEnabled' : 'toasts.modsDisabled',
        3000,
        {
          count: uniqueMods.length,
          plural: uniqueMods.length > 1 ? 's' : '',
        },
      );
      return;
    }

    if (!window.electronAPI?.toggleMod) {
      window.toastManager?.error('toasts.failedToToggleMods', 3000, {
        error: 'toggleMod API unavailable',
      });
      return;
    }

    const failedMods: Array<{ mod: Mod; error: string }> = [];
    let successCount = 0;

    for (const mod of modsToToggle) {
      const result = await window.electronAPI.toggleMod(
        mod.path!,
        this.modManager.modsPath,
      );

      if (result.success) {
        successCount++;
      } else {
        failedMods.push({
          mod,
          error: result.error || 'Unknown error',
        });
      }
    }

    if (successCount > 0 && failedMods.length === 0) {
      window.toastManager?.success(
        nextStatus === 'active' ? 'toasts.modsEnabled' : 'toasts.modsDisabled',
        3000,
        {
          count: uniqueMods.length,
          plural: uniqueMods.length > 1 ? 's' : '',
        },
      );
    } else if (successCount > 0) {
      window.toastManager?.warning('toasts.modsToggledPartial', 4000, {
        success: successCount,
        error: failedMods.length,
      });
    } else if (failedMods.length > 0) {
      window.toastManager?.error('toasts.failedToToggleMods', 4000, {
        error: failedMods[0].error,
      });
    }

    if (successCount > 0) {
      await this.modManager.fetchMods();
    }
  }

  async openModFolder(mod: Mod) {
    if (!mod.path) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotOpenFolder');
      }
      return;
    }

    if (window.electronAPI && window.electronAPI.openFolder) {
      const result = await window.electronAPI.openFolder(mod.path);

      if (!result.success) {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToOpenFolder', 3000, {
            error: result.error,
          });
        }
      }
    }
  }

  async uninstallMod(mod: Mod) {
    if (!mod.path) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotUninstallMod');
      }
      return;
    }

    if (window.modalManager) {
      window.modalManager.openUninstallModal(mod, async () => {
        const { successCount, failedMods } = await this.deleteMods([mod]);

        if (successCount > 0) {
          console.log('Mod uninstalled successfully');

          if (window.toastManager) {
            window.toastManager.success('toasts.modUninstalled');
          }

          await this.modManager.fetchMods();
          return;
        }

        if (window.toastManager && failedMods.length > 0) {
          window.toastManager.error('toasts.failedToUninstallMod', 3000, {
            error: failedMods[0].error,
          });
        }
      });
    }
  }

  async uninstallMods(mods: Mod[]) {
    const uniqueMods = this.getUniqueMods(mods).filter((mod) => !!mod.path);

    if (uniqueMods.length === 0) {
      window.toastManager?.error('toasts.cannotUninstallMod');
      return;
    }

    if (uniqueMods.length === 1) {
      await this.uninstallMod(uniqueMods[0]);
      return;
    }

    if (!window.modalManager) {
      return;
    }

    window.modalManager.openUninstallModal(uniqueMods, async () => {
      const { successCount, failedMods } = await this.deleteMods(uniqueMods);

      if (successCount > 0 && failedMods.length === 0) {
        window.toastManager?.success('toasts.modsUninstalled', 3000, {
          count: successCount,
          plural: successCount > 1 ? 's' : '',
        });
      } else if (successCount > 0) {
        window.toastManager?.warning('toasts.modsUninstalledPartial', 4000, {
          success: successCount,
          error: failedMods.length,
        });
      } else if (failedMods.length > 0) {
        window.toastManager?.error('toasts.failedToUninstallMods', 4000, {
          error: failedMods[0].error,
        });
      }

      if (successCount > 0) {
        await this.modManager.fetchMods();
      }
    });
  }

  async startChangeSlotsFlow(mod: Mod) {
    if (!mod.path) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotChangeSlot');
      }

      return;
    }

    if (window.electronAPI && window.electronAPI.scanMod) {
      const scanResult = await window.electronAPI.scanMod(mod.path);

      if (scanResult.success) {
        if (scanResult.data.fighterNames.length === 0) {
          if (window.toastManager) {
            window.toastManager.error('toasts.noSlotsFound');
          }
          return;
        }

        if (window.modalManager) {
          window.modalManager.openChangeSlotModal(
            mod,
            scanResult.data,
            async (slotAssignments, deletedSlots) => {
              if (window.electronAPI && window.electronAPI.changeSlots) {
                const changeSlotsResult = await window.electronAPI.changeSlots(
                  mod.path,
                  scanResult.data.pathData,
                  slotAssignments,
                  deletedSlots,
                );

                if (changeSlotsResult.success) {
                  if (window.toastManager) {
                    window.toastManager.success('toasts.slotChanged');
                  }

                  this.modManager.fetchMods();
                } else {
                  window.toastManager.error('toasts.failedToChangeSlot', 3000, {
                    error: changeSlotsResult.error,
                  });
                }
              }
            },
          );
        }
      } else {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToChangeSlot', 3000, {
            error: scanResult.error || 'Unknown error',
          });
        }
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.ModOperations = ModOperations;
}

export { type ModOperations };
