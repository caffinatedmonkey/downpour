import {Injectable} from 'angular2/core';

import {Torrent} from '../models/torrent';
import {ValueMap} from '../models/map';
import {TorrentRequest, TorrentType} from '../models/torrent_request';
import {Configuration} from '../models/configuration';
import {File, Directory, fromFilesTree} from '../models/tree';
import {State} from '../models/state';

@Injectable()
export class DelugeService {
  // Do we have an authenticated session with the server.
  authenticated: boolean;

  // The URL at which the JSON endpoint of the server is located at.
  serverURL: string;

  // Not really used, but required for a uniq val in rpc request.
  id: number = 0;

  // Calls a method on the remote using the rpc protocol over json.
  // TODO: Support Sockets for Native App
  rpc(method: string, payload: any, serverURL?: string): Promise<string|Object> {
    var headers = new Headers();
    headers.append('Content-Type', 'application/json');

    return fetch(
      (serverURL ? serverURL : this.serverURL),
      {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          method: method,
          params: payload,
          id: this.id++,
        }),
        credentials: 'include',
      }
    )
      .then(r => {
        if (r.ok)
          return Promise.resolve(r)
        else
          return Promise.reject(r)
      })
      .catch(_ => Promise.reject('Request Failed'))

      .then(d => d.json())
      .catch(d => {
        if (d)
          return Promise.reject(d);
        else
          Promise.reject("Failed to parse JSON")
      })

      .then(d => {
        if (d.error)
          return Promise.reject(d.error)
        else
          return Promise.resolve(d.result)
      });
  }

  // Authenticates the client with the server, configuring the session.
  auth(serverURL: string, password: string): Promise<string|void> {
    return this.rpc('auth.login', [password], serverURL)
      .then(
        d => {
          if (!d) {
            return Promise.reject("Authentication Failed")
          } else {
            this.serverURL = serverURL;
            this.authenticated = true;
            return Promise.resolve()
          }
        }
      )
  }

  // The information requested about each torrent every time sync is called.
  // These are the values requested by default by the official deluge web client.
  syncStateInformation: string[] = [
    "queue",
    "name",
    "total_wanted",
    "state",
    "progress",
    "num_seeds",
    "total_seeds",
    "num_peers",
    "total_peers",
    "download_payload_rate",
    "upload_payload_rate",
    "eta",
    "ratio",
    "distributed_copies",
    "is_auto_managed",
    "time_added",
    "tracker_host",
    "save_path",
    "total_done",
    "total_uploaded",
    "max_download_speed",
    "max_upload_speed",
    "seeds_peers_ratio",
    "label",
  ];

  state: State = new State();
  stateChanged: Observable = new Observable();

  // Brings the service's state in sync with the remote's state.
  // TODO: Immutable or Observer?
  sync(): Promise<State> {
    return this.rpc('web.update_ui', [this.syncStateInformation, {}])
      .then(d => {
        this.state.unmarshall(d);
        return this.state;
      });
  }

  pause(hashes: string[]): Promise<any> {
    return this.rpc('core.pause_torrent', [hashes])
  }

  resume(hashes: string[]): Promise<any> {
    return this.rpc('core.resume_torrent', [hashes]);
  }

  remove(hashes: string[], removeData: boolean): Promise<any> {
    return Promise.all(hashes.map((v, i) => {
      return this.rpc('core.remove_torrent', [v, removeData]);
    }));
  }

  // Takes a URL, Magnet Link, or location on the remote server and returns a
  // TorrentRequest.
  getInfo(url: string, serverFile: boolean = false): Promise<TorrentRequest> {
    var ti = new TorrentRequest();
    return (() => {
      if (url.startsWith('magnet') && !serverFile) {
        ti.format = TorrentType.Magnet;
        ti.path = url;
        return this.rpc('web.get_magnet_info', [url]);
      } else {
        ti.format = TorrentType.File;

        return (() => {
          if (!serverFile) {
            return this.rpc('web.download_torrent_from_url', [url])
          } else {
            return Promise.resolve(url);
          }
        })()
        .then(d => {
          ti.path = d
          return this.rpc('web.get_torrent_info', [d])
        })
      }
    })()
    .then(d => {
      ti.unmarshall(d)
      return ti;
    })
  }

  getConfig(params: string[] = []): Promise<Configuration> {
    return this.rpc('core.get_config_values', [params])
      .then(d => new Configuration(d));
  }

  getAllConfig(): Promise<Configuration> {
    return this.rpc('core.get_config', [])
      .then(d => new Configuration(d));
  }

  setConfig(c: Configuration): Promise<void> {
    return this.rpc('core.set_config', [c.marshall()]);
  }

  syncOnceInformation: string[];
  currentTorrent: Torrent;

  syncTorrent(hash: string): Promise<any> {
    if (!this.currentTorrent) this.currentTorrent = new Torrent();
    return this.rpc('web.get_torrent_status', [hash, this.syncOnceInformation])
      .then(d => this.currentTorrent.unmarshall(d));
  }

  getTree(hash: string): Promise<Directory|File> {
    return this.rpc('web.get_torrent_files', [hash])
      .then(d => fromFilesTree(d));
  }
}

