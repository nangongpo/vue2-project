## 直接下载 Redis 官方源码编译

- ### 编译

  ```
  curl -O https://download.redis.io/redis-stable.tar.gz
  tar -xzvf redis-stable.tar.gz
  cd redis-stable
  make
  ```
- ### 安装到系统全局路径
  ```
  在当前 redis-stable 目录下运行以下命令，将 redis-server 和 redis-cli 等工具安装到系统的全局可执行目录中：

  sudo make install

  验证方式： 任意打开一个新的终端窗口，输入 redis-server -v，如果能输出 Redis 的版本号，说明全局安装成功！
  ```

- ### 准备配置文件并启动服务
  ```
  1. 创建配置目录并复制配置文件：

  sudo mkdir -p /usr/local/etc
  sudo cp redis.conf /usr/local/etc/redis.conf

  2. 修改配置以支持“后台后台运行” (可选但强力推荐）
  
  sudo nano /usr/local/etc/redis.conf

  按 Ctrl + W 搜索 daemonize。

  将 daemonize no 改为 daemonize yes（这样 Redis 就会在后台悄悄运行，不会占用你的终端界面）。

  按 Ctrl + O 再回车保存，按 Ctrl + X 退出编辑器。

  3. 指定配置文件启动 Redis

  redis-server /usr/local/etc/redis.conf
  ```

- ### 测试连接
  ```
  服务启动后，使用 Redis 官方客户端测试是否能正常响应：

  redis-cli

  进入交互界面（显示 127.0.0.1:6379>）后，输入：

  ping

  验证方式： 如果终端返回 PONG，说明你的 Redis 已经完全部署成功且正常运行了！输入 exit 退出客户端即可。
  ```

- ### 日常维护
  ```
  关闭 Redis 服务：在终端运行 redis-cli shutdown

  查看 Redis 是否在后台运行：运行 ps aux | grep redis
  ```
