import RNFS from "react-native-fs";
import * as ErrorLog from "./ErrorLog";
import { PermissionsAndroid } from "react-native";

const externalBloomDirPath = RNFS.ExternalStorageDirectoryPath + "/Bloom";

export function nameFromPath(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export async function rnfsSafeUnlink(path: string): Promise<void> {
  try {
    const exists = await RNFS.exists(path);
    if (exists) RNFS.unlink(path);
  } catch (err) {
    ErrorLog.logError({
      logMessage: `[rnfsSafeUnlink] Error deleting file: ${path}\n${JSON.stringify(
        err
      )}`
    });
  }
}

// Using the external storage (including the traditional Bloom folder)
// requires user permission at runtime.
// This method checks for permission (requesting it if necessary) and
// if permission is granted, returns the path to the folder
// otherwise it throws "External Storage Permission Refused"
export async function readExternalBloomDir(): Promise<string> {
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
  );
  if (granted) {
    return externalBloomDirPath;
  } else {
    throw "External Storage Permission Refused";
  }
}
