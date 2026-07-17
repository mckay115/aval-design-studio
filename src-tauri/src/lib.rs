use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildInfo {
    version: &'static str,
    repository: &'static str,
    packaged_toolchain: bool,
    updates_enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolchainHealth {
    available: bool,
    version: Option<String>,
    ffmpeg: bool,
    ffprobe: bool,
    encoders: Vec<String>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompiledAsset {
    name: String,
    size: u64,
    sha256: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompileResult {
    output_path: String,
    report_path: Option<String>,
    assets: Vec<CompiledAsset>,
    source_markup: Option<String>,
    warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedStudioProject {
    document: serde_json::Value,
    path: String,
    source_paths: Vec<Option<String>>,
    missing_source_paths: Vec<String>,
}

#[derive(Deserialize)]
struct CompilerAssetResult {
    path: String,
    bytes: u64,
    sha256: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompilerJsonResult {
    output_path: String,
    report_path: Option<String>,
    #[serde(default)]
    assets: Vec<CompilerAssetResult>,
    #[serde(default)]
    source_markup: Option<String>,
    #[serde(default)]
    warnings: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolchainManifest {
    target: String,
    aval: ManifestAval,
    node: ManifestVersion,
    ffmpeg: ManifestVersion,
    ffprobe: ManifestVersion,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestAval {
    compiler_version: String,
}

#[derive(Deserialize)]
struct ManifestVersion {
    version: String,
}

struct CompilerRuntime {
    node: PathBuf,
    cli: PathBuf,
}

#[cfg(desktop)]
fn updater_is_configured<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .is_some_and(|config| !config.is_null())
}

#[tauri::command]
fn build_info(app: tauri::AppHandle) -> BuildInfo {
    let packaged_toolchain = packaged_compiler(&app).is_some()
        && packaged_tool(&app, "ffmpeg").is_some()
        && packaged_tool(&app, "ffprobe").is_some()
        && packaged_manifest(&app).is_some();
    BuildInfo {
        version: env!("CARGO_PKG_VERSION"),
        repository: env!("CARGO_PKG_REPOSITORY"),
        packaged_toolchain,
        #[cfg(desktop)]
        updates_enabled: updater_is_configured(&app),
        #[cfg(not(desktop))]
        updates_enabled: false,
    }
}

fn executable_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_owned()
    }
}

fn tool_candidates(app: &tauri::AppHandle, name: &str) -> Vec<PathBuf> {
    let executable = executable_name(name);
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(&executable));
        candidates.push(resource_dir.join("binaries").join(&executable));
    }
    if let Ok(current) = std::env::current_exe()
        && let Some(parent) = current.parent()
    {
        candidates.push(parent.join(&executable));
        candidates.push(parent.join("../Resources").join(&executable));
    }
    candidates
}

fn packaged_tool(app: &tauri::AppHandle, name: &str) -> Option<PathBuf> {
    tool_candidates(app, name)
        .into_iter()
        .find(|candidate| candidate.is_file())
}

fn resource_candidates(app: &tauri::AppHandle, relative: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(relative));
    }
    if let Ok(current) = std::env::current_exe()
        && let Some(parent) = current.parent()
    {
        candidates.push(parent.join("../Resources").join(relative));
        candidates.push(parent.join(relative));
    }
    candidates
}

fn packaged_compiler(app: &tauri::AppHandle) -> Option<CompilerRuntime> {
    let node = packaged_tool(app, "aval-node")?;
    let cli = resource_candidates(
        app,
        Path::new("toolchain-runtime/node_modules/@pixel-point/aval-compiler/dist/cli.js"),
    )
    .into_iter()
    .find(|candidate| candidate.is_file())?;
    Some(CompilerRuntime { node, cli })
}

fn packaged_manifest(app: &tauri::AppHandle) -> Option<ToolchainManifest> {
    let path = resource_candidates(app, Path::new("toolchain-runtime/toolchain-manifest.json"))
        .into_iter()
        .find(|candidate| candidate.is_file())?;
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

fn command_succeeds(path: &Path, argument: &str) -> bool {
    Command::new(path)
        .arg(argument)
        .output()
        .is_ok_and(|output| output.status.success())
}

fn compiler_succeeds(runtime: &CompilerRuntime) -> bool {
    Command::new(&runtime.node)
        .arg(&runtime.cli)
        .arg("--help")
        .output()
        .is_ok_and(|output| output.status.success())
}

#[tauri::command]
fn toolchain_health(app: tauri::AppHandle) -> ToolchainHealth {
    let compiler = packaged_compiler(&app);
    let manifest = packaged_manifest(&app);
    let ffmpeg_path = packaged_tool(&app, "ffmpeg");
    let ffprobe_path = packaged_tool(&app, "ffprobe");
    let ffmpeg = ffmpeg_path
        .as_deref()
        .is_some_and(|path| command_succeeds(path, "-version"));
    let ffprobe = ffprobe_path
        .as_deref()
        .is_some_and(|path| command_succeeds(path, "-version"));
    let compiler_ready = compiler.as_ref().is_some_and(compiler_succeeds);
    let encoders = ffmpeg_path
        .as_deref()
        .and_then(|path| {
            Command::new(path)
                .args(["-hide_banner", "-encoders"])
                .output()
                .ok()
        })
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).into_owned())
        .map(|text| {
            ["libaom-av1", "libvpx-vp9", "libx265", "libx264"]
                .into_iter()
                .filter(|encoder| text.contains(encoder))
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let available = compiler_ready && ffmpeg && ffprobe && manifest.is_some();
    let encoder_count = encoders.len();
    let compiler_version = manifest
        .as_ref()
        .map(|value| value.aval.compiler_version.clone());
    let manifest_summary = manifest.as_ref().map(|value| {
        format!(
            "AVAL {}, Node {}, FFmpeg {}, FFprobe {} ({})",
            value.aval.compiler_version,
            value.node.version,
            value.ffmpeg.version,
            value.ffprobe.version,
            value.target
        )
    });
    ToolchainHealth {
        available,
        version: compiler_ready.then(|| compiler_version.unwrap_or_else(|| "1.0.0".to_owned())),
        ffmpeg,
        ffprobe,
        encoders,
        message: if available && encoder_count == 4 {
            format!(
                "{} and all four reviewed encoders are ready.",
                manifest_summary.unwrap_or_else(|| "Packaged AVAL toolchain".to_owned())
            )
        } else if available {
            format!(
                "AVAL compiler 1.0 is ready with {encoder_count} of 4 reviewed encoders. Select only available outputs."
            )
        } else {
            "This build is incomplete: the packaged AVAL compiler runtime, FFmpeg, FFprobe, or provenance manifest is missing.".to_owned()
        },
    }
}

#[tauri::command]
async fn save_studio_project(
    app: tauri::AppHandle,
    document: serde_json::Value,
    suggested_name: String,
) -> Result<Option<String>, String> {
    let safe_name = Path::new(&suggested_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("motion.avalstudio")
        .to_owned();
    let contents = format!(
        "{}\n",
        serde_json::to_string_pretty(&document)
            .map_err(|error| format!("Could not serialize the Studio project: {error}"))?
    );
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("Save AVAL Studio project")
            .set_file_name(safe_name)
            .add_filter("AVAL Studio project", &["avalstudio"])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected
            .into_path()
            .map_err(|error| format!("The selected save path is invalid: {error}"))?;
        fs::write(&path, contents)
            .map_err(|error| format!("Could not save the Studio project: {error}"))?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|error| format!("The native save task failed: {error}"))?
}

fn is_studio_project_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_ascii_lowercase)
        .is_some_and(|name| name.ends_with(".avalstudio") || name.ends_with(".avalstudio.json"))
}

#[tauri::command]
async fn open_studio_project(app: tauri::AppHandle) -> Result<Option<OpenedStudioProject>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("Open AVAL Studio project")
            .add_filter("AVAL Studio project", &["avalstudio", "json"])
            .blocking_pick_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected
            .into_path()
            .map_err(|error| format!("The selected project path is invalid: {error}"))?;
        if !is_studio_project_path(&path) {
            return Err("Choose an .avalstudio or .avalstudio.json project file.".to_owned());
        }
        let metadata = fs::metadata(&path)
            .map_err(|error| format!("Could not inspect the Studio project: {error}"))?;
        if metadata.len() > 16 * 1024 * 1024 {
            return Err("The Studio project is larger than the 16 MB document limit.".to_owned());
        }
        let document: serde_json::Value = serde_json::from_slice(
            &fs::read(&path)
                .map_err(|error| format!("Could not read the Studio project: {error}"))?,
        )
        .map_err(|error| format!("The Studio project does not contain valid JSON: {error}"))?;

        let project_directory = path.parent().unwrap_or_else(|| Path::new("."));
        let source_paths = document
            .get("sources")
            .and_then(serde_json::Value::as_array)
            .map(|sources| {
                sources
                    .iter()
                    .map(|source| {
                        let source_path = source.get("descriptor")?.get("path")?.as_str()?;
                        let path = PathBuf::from(source_path);
                        let resolved = if path.is_absolute() {
                            path
                        } else {
                            project_directory.join(path)
                        };
                        Some(resolved.to_string_lossy().into_owned())
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let missing_source_paths = source_paths
            .iter()
            .flatten()
            .filter(|source_path| !Path::new(source_path).is_file())
            .cloned()
            .collect::<Vec<_>>();
        for source_path in source_paths.iter().flatten() {
            if Path::new(source_path).is_file() {
                app.asset_protocol_scope()
                    .allow_file(source_path)
                    .map_err(|error| {
                        format!("Could not authorize the project source for preview: {error}")
                    })?;
            }
        }

        Ok(Some(OpenedStudioProject {
            document,
            path: path.to_string_lossy().into_owned(),
            source_paths,
            missing_source_paths,
        }))
    })
    .await
    .map_err(|error| format!("The native open task failed: {error}"))?
}

fn safe_file_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .ok_or_else(|| "The source path does not have a valid file name.".to_owned())
}

#[tauri::command]
async fn compile_bundle(
    app: tauri::AppHandle,
    mut project: serde_json::Value,
    destination: String,
    force: bool,
    matte: Option<String>,
) -> Result<CompileResult, String> {
    let compiler = packaged_compiler(&app)
        .ok_or_else(|| "The reviewed AVAL compiler is not packaged in this build.".to_owned())?;
    let ffmpeg = packaged_tool(&app, "ffmpeg")
        .ok_or_else(|| "The reviewed FFmpeg binary is not packaged in this build.".to_owned())?;
    let ffprobe = packaged_tool(&app, "ffprobe")
        .ok_or_else(|| "The reviewed FFprobe binary is not packaged in this build.".to_owned())?;
    if destination.trim().is_empty() {
        return Err("Choose a nonempty build destination.".to_owned());
    }
    let destination_path = PathBuf::from(&destination);
    if destination_path.exists() && !force {
        let populated = destination_path
            .read_dir()
            .map_err(|error| format!("Could not inspect the destination: {error}"))?
            .next()
            .is_some();
        if populated {
            return Err(
                "The destination is not empty. Confirm Replace before building again.".to_owned(),
            );
        }
    }

    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Could not locate the app cache: {error}"))?
        .join(format!("compile-{}", std::process::id()));
    if cache_root.exists() {
        fs::remove_dir_all(&cache_root)
            .map_err(|error| format!("Could not reset the compilation workspace: {error}"))?;
    }
    let source_root = cache_root.join("source");
    fs::create_dir_all(&source_root)
        .map_err(|error| format!("Could not create the compilation workspace: {error}"))?;

    let alpha = project
        .get("alpha")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("auto")
        .to_owned();
    let frame_rate = project
        .get("frameRate")
        .and_then(serde_json::Value::as_object)
        .and_then(|rate| {
            Some(format!(
                "{}/{}",
                rate.get("numerator")?.as_u64()?,
                rate.get("denominator")?.as_u64()?
            ))
        })
        .unwrap_or_else(|| "30/1".to_owned());
    let matte = matte.filter(|value| {
        value.len() == 7
            && value.starts_with('#')
            && value[1..]
                .chars()
                .all(|character| character.is_ascii_hexdigit())
    });
    let canvas_size = project
        .get("canvas")
        .and_then(serde_json::Value::as_object)
        .and_then(|canvas| {
            Some(format!(
                "{}x{}",
                canvas.get("width")?.as_u64()?,
                canvas.get("height")?.as_u64()?
            ))
        })
        .unwrap_or_else(|| "1920x1080".to_owned());
    let sources = project
        .get_mut("sources")
        .and_then(serde_json::Value::as_array_mut)
        .ok_or_else(|| "The AVAL project must contain a sources array.".to_owned())?;
    for (source_index, source) in sources.iter_mut().enumerate() {
        let object = source
            .as_object_mut()
            .ok_or_else(|| "Each AVAL source must be an object.".to_owned())?;
        let original = object
            .get("path")
            .and_then(serde_json::Value::as_str)
            .map(PathBuf::from)
            .ok_or_else(|| "Each AVAL source must have a local path.".to_owned())?;
        if !original.is_file() {
            return Err(format!("Source media is missing: {}", original.display()));
        }
        let extension = original
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .unwrap_or_default();
        let name = if ["mov", "mp4", "m4v"].contains(&extension.as_str()) && matte.is_none() {
            let name = safe_file_name(&original)?;
            fs::copy(&original, source_root.join(&name))
                .map_err(|error| format!("Could not stage source media: {error}"))?;
            name
        } else {
            let name = format!("canonical-{}.mov", source_index + 1);
            let staged = source_root.join(&name);
            let ffmpeg_for_prep = ffmpeg.clone();
            let original_for_prep = original.clone();
            let staged_for_prep = staged.clone();
            let rate_for_prep = frame_rate.clone();
            let canvas_for_prep = canvas_size.clone();
            let matte_for_prep = matte.clone();
            let keep_alpha = alpha != "opaque";
            let prepared = tauri::async_runtime::spawn_blocking(move || {
                let mut command = Command::new(ffmpeg_for_prep);
                command
                    .args(["-hide_banner", "-loglevel", "error", "-y", "-i"])
                    .arg(original_for_prep)
                    .args(["-map", "0:v:0", "-an", "-sn", "-dn"]);
                if let Some(matte_color) = matte_for_prep {
                    command
                        .args(["-filter_complex"])
                        .arg(format!(
                            "color=c={matte_color}:s={canvas_for_prep}:r={rate_for_prep}[bg];[0:v]format=rgba[fg];[bg][fg]overlay=shortest=1:format=auto,fps={rate_for_prep},setsar=1,format=yuv422p10le"
                        ));
                } else {
                    command.args(["-vf"]).arg(format!("fps={rate_for_prep},setsar=1"));
                }
                command
                    .args(["-c:v", "prores_ks", "-profile:v"])
                    .arg(if keep_alpha { "4" } else { "3" })
                    .args(["-pix_fmt", if keep_alpha { "yuva444p10le" } else { "yuv422p10le" }])
                    .arg(staged_for_prep)
                    .output()
            })
            .await
            .map_err(|error| format!("Source preparation task failed: {error}"))?
            .map_err(|error| format!("Could not start FFmpeg source preparation: {error}"))?;
            if !prepared.status.success() {
                return Err(format!(
                    "Source preparation failed: {}",
                    String::from_utf8_lossy(&prepared.stderr)
                        .lines()
                        .take(8)
                        .collect::<Vec<_>>()
                        .join("\n")
                ));
            }
            name
        };
        object.insert(
            "path".to_owned(),
            serde_json::Value::String(format!("source/{name}")),
        );
    }
    let project_path = cache_root.join("motion.json");
    fs::write(
        &project_path,
        serde_json::to_vec_pretty(&project).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("Could not write the compiler project: {error}"))?;

    let compiler_node = compiler.node;
    let compiler_cli = compiler.cli;
    let ffmpeg_path = ffmpeg.clone();
    let ffprobe_path = ffprobe.clone();
    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut command = Command::new(compiler_node);
        command
            .arg(compiler_cli)
            .arg("compile")
            .arg(project_path)
            .arg("--out")
            .arg(&destination_path)
            .arg("--ffmpeg")
            .arg(ffmpeg_path)
            .arg("--ffprobe")
            .arg(ffprobe_path)
            .arg("--json");
        if force {
            command.arg("--force");
        }
        command.output()
    })
    .await
    .map_err(|error| format!("Compiler task failed: {error}"))?
    .map_err(|error| format!("Could not launch the AVAL compiler: {error}"))?;

    let _ = fs::remove_dir_all(&cache_root);
    if !output.status.success() {
        let diagnostic = String::from_utf8_lossy(&output.stderr);
        return Err(diagnostic.lines().take(8).collect::<Vec<_>>().join("\n"));
    }
    let result: CompilerJsonResult = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("The compiler returned invalid JSON: {error}"))?;
    Ok(CompileResult {
        output_path: result.output_path,
        report_path: result.report_path,
        assets: result
            .assets
            .into_iter()
            .map(|asset| CompiledAsset {
                name: Path::new(&asset.path)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or(&asset.path)
                    .to_owned(),
                size: asset.bytes,
                sha256: asset.sha256,
            })
            .collect(),
        source_markup: result.source_markup,
        warnings: result.warnings,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            if updater_is_configured(app.handle()) {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            build_info,
            toolchain_health,
            open_studio_project,
            save_studio_project,
            compile_bundle
        ])
        .run(tauri::generate_context!())
        .expect("error while running AVAL Design Studio");
}
